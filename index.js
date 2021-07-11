
const db = require('diskdb')
const fs = require('fs')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const fileUpload = require('express-fileupload');
const onShutdown = require("node-graceful-shutdown").onShutdown;

const api = require('./src/api')
const dbMigration = require('./src/database-migration');
const video = require('./src/video')
const HDHR = require('./src/hdhr')
const FileCacheService = require('./src/services/file-cache-service');
const CacheImageService = require('./src/services/cache-image-service');
const Plugins = require('./src/plugin');

const xmltv = require('./src/xmltv')
const Plex = require('./src/plex');
const channelCache = require('./src/channel-cache');
const constants = require('./src/constants')
const ChannelDB = require("./src/dao/channel-db");
const M3uService = require("./src/services/m3u-service");
const FillerDB = require("./src/dao/filler-db");
const CustomShowDB = require("./src/dao/custom-show-db");
const TVGuideService = require("./src/services/tv-guide-service");
const EventService = require("./src/services/event-service");
const app = express();

console.log(
`         \\
   dizqueTV ${constants.VERSION_NAME}
.------------.
|:::///### o |
|:::///###   |
':::///### o |
'------------'
`);


for (let i = 0, l = process.argv.length; i < l; i++) {
    if ((process.argv[i] === "-p" || process.argv[i] === "--port") && i + 1 !== l)
        process.env.PORT = process.argv[i + 1]
    if ((process.argv[i] === "-d" || process.argv[i] === "--database") && i + 1 !== l)
        process.env.DATABASE = process.argv[i + 1]
}

process.env.DATABASE = process.env.DATABASE || path.join(__dirname, ".dizquetv");
process.env.PORT = process.env.PORT || 8000;

const pluginsFolder = path.join(process.env.DATABASE, 'plugins');

if (!fs.existsSync(process.env.DATABASE)) {
    if (fs.existsSync(  path.join(".", ".pseudotv")  )) {
        throw Error(process.env.DATABASE + " folder not found but ./.pseudotv has been found. Please rename this folder or create an empty " + process.env.DATABASE + " folder so that the program is not confused about.");
    }
    fs.mkdirSync(process.env.DATABASE)
}

if(!fs.existsSync(path.join(process.env.DATABASE, 'images'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'images'))
}
if(!fs.existsSync(path.join(process.env.DATABASE, 'channels'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'channels'))
}
if(!fs.existsSync(path.join(process.env.DATABASE, 'filler'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'filler'))
}
if(!fs.existsSync(path.join(process.env.DATABASE, 'custom-shows'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'custom-shows'))
}
if(!fs.existsSync(path.join(process.env.DATABASE, 'cache'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'cache'))
}
if(!fs.existsSync(path.join(process.env.DATABASE, 'cache','images'))) {
    fs.mkdirSync(path.join(process.env.DATABASE, 'cache','images'))
}
if(!fs.existsSync(pluginsFolder)) {
    fs.mkdirSync(pluginsFolder)
}


channelDB = new ChannelDB( path.join(process.env.DATABASE, 'channels') );
fillerDB = new FillerDB( path.join(process.env.DATABASE, 'filler') , channelDB, channelCache );

customShowDB = new CustomShowDB( path.join(process.env.DATABASE, 'custom-shows') );

db.connect(process.env.DATABASE, ['channels', 'plex-servers', 'ffmpeg-settings', 'plex-settings', 'xmltv-settings', 'hdhr-settings', 'db-version', 'client-id', 'cache-images', 'settings', 'plugin-manager'])

// Change the flag on Database to show that the dizqueTV was rebooted
const restartSettingQuery = {setting: 'serverRestart'};
if(db['settings'].find(restartSettingQuery)[0]) {
    db['settings'].update(restartSettingQuery, {setting: 'serverRestart', value: false});
} else {
    db['settings'].save({setting: 'serverRestart', value: false});
}


fileCache = new FileCacheService( path.join(process.env.DATABASE, 'cache') );
cacheImageService = new CacheImageService(db, fileCache);
m3uService = new M3uService(channelDB, fileCache, channelCache)
eventService = new EventService();
eventService.setup(app);

const plugins = new Plugins(pluginsFolder, eventService, process.env.DATABASE, db);

initDB(db, channelDB)


const guideService = new TVGuideService(xmltv, db, cacheImageService);


let xmltvInterval = {
    interval: null,
    lastRefresh: null,
    updateXML: async () => {
        let getChannelsCached = async() => {
            let channelNumbers = await channelDB.getAllChannelNumbers();
            return await Promise.all( channelNumbers.map( async (x) => {
                return (await channelCache.getChannelConfig(channelDB, x))[0];
            }) );
        }

        let channels = [];

        try {
            channels = await getChannelsCached();
            let xmltvSettings = db['xmltv-settings'].find()[0];
            let t = guideService.prepareRefresh(channels, xmltvSettings.cache*60*60*1000);
            channels = null;

            await guideService.refresh(t);
            xmltvInterval.lastRefresh = new Date()
            console.log('XMLTV Updated at ', xmltvInterval.lastRefresh.toLocaleString());
        } catch (err) {
            console.error("Unable to update TV guide?", err);
            return;
        }
        channels = await getChannelsCached();

        let plexServers = db['plex-servers'].find()
        for (let i = 0, l = plexServers.length; i < l; i++) {       // Foreach plex server
            let plex = new Plex(plexServers[i])
            let dvrs;
            if ( !plexServers[i].arGuide && !plexServers[i].arChannels) {
                continue;
            }
            try {
                dvrs = await plex.GetDVRS() // Refresh guide and channel mappings
            } catch(err) {
                console.error(`Couldn't get DVRS list from ${plexServers[i].name}. This error will prevent 'refresh guide' or 'refresh channels' from working for this Plex server. But it is NOT related to playback issues.` , err );
                continue;
            }
            if (plexServers[i].arGuide) {
                try {
                    await plex.RefreshGuide(dvrs);
                } catch(err) {
                    console.error(`Couldn't tell Plex ${plexServers[i].name} to refresh guide for some reason. This error will prevent 'refresh guide' from working for this Plex server. But it is NOT related to playback issues.` , err);
                }
            }
            if (plexServers[i].arChannels && channels.length !== 0) {
                try {
                    await plex.RefreshChannels(channels, dvrs);
                } catch(err) {
                    console.error(`Couldn't tell Plex ${plexServers[i].name} to refresh channels for some reason. This error will prevent 'refresh channels' from working for this Plex server. But it is NOT related to playback issues.` , err);
                }
            }
        }
    },
    startInterval: () => {
        let xmltvSettings = db['xmltv-settings'].find()[0]
        if (xmltvSettings.refresh !== 0) {
            xmltvInterval.interval = setInterval( async () => {
                try {
                    await xmltvInterval.updateXML()
                } catch(err) {
                    console.error("update XMLTV error", err);
                }
            }, xmltvSettings.refresh * 60 * 60 * 1000)
        }
    },
    restartInterval: () => {
        if (xmltvInterval.interval !== null)
            clearInterval(xmltvInterval.interval)
        xmltvInterval.startInterval()
    }
}

xmltvInterval.updateXML()
xmltvInterval.startInterval()

let hdhr = HDHR(db, channelDB)

app.use(fileUpload({
    createParentPath: true
}));
app.use(bodyParser.json({limit: '50mb'}))

app.get('/version.js', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/javascript'
    });

    res.write( `
        function setUIVersionNow() {
            setTimeout( setUIVersionNow, 1000);
            var element = document.getElementById("uiversion");
            if (element != null) {
                element.innerHTML = "${constants.VERSION_NAME}";
            }
        }
        setTimeout( setUIVersionNow, 1000);
    ` );
    res.end();
});

app.use((req, res, next) => plugins.middleware(req, res, next));

app.use('/images', express.static(path.join(process.env.DATABASE, 'images')))
app.use(express.static(path.join(__dirname, 'web','public')))
app.use('/images', express.static(path.join(process.env.DATABASE, 'images')))
app.use('/cache/images', cacheImageService.routerInterceptor())
app.use('/cache/images', express.static(path.join(process.env.DATABASE, 'cache','images')))
app.use('/favicon.svg', express.static(
    path.join(__dirname, 'resources','favicon.svg')
) );
app.use('/custom.css', (req, res, next) => plugins.css(req, res, next))
app.use('/plugins.js', (req, res, next) => plugins.js(req, res, next) )

// API Routers
app.use(api.router(db, channelDB, fillerDB, customShowDB, xmltvInterval, guideService, m3uService, eventService ))
app.use('/api/cache/images', cacheImageService.apiRouters())
app.use('/api/plugins', plugins.Routers);

app.use(video.router(channelDB, fillerDB, db))
app.use(hdhr.router)
app.listen(process.env.PORT, () => {
    console.log(`HTTP server running on port: http://*:${process.env.PORT}`)
    let hdhrSettings = db['hdhr-settings'].find()[0]
    if (hdhrSettings.autoDiscovery === true)
        hdhr.ssdp.start()
})

function initDB(db, channelDB) {
    if (!fs.existsSync(process.env.DATABASE + '/images/dizquetv.png')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/dizquetv.png')))
        fs.writeFileSync(process.env.DATABASE + '/images/dizquetv.png', data)
    }
    dbMigration.initDB(db, channelDB, __dirname);
    if (!fs.existsSync(process.env.DATABASE + '/font.ttf')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/font.ttf')))
        fs.writeFileSync(process.env.DATABASE + '/font.ttf', data)
    }
    if (!fs.existsSync(process.env.DATABASE + '/images/generic-error-screen.png')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/generic-error-screen.png')))
        fs.writeFileSync(process.env.DATABASE + '/images/generic-error-screen.png', data)
    }
    if (!fs.existsSync(process.env.DATABASE + '/images/generic-offline-screen.png')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/generic-offline-screen.png')))
        fs.writeFileSync(process.env.DATABASE + '/images/generic-offline-screen.png', data)
    }
    if (!fs.existsSync(process.env.DATABASE + '/images/generic-music-screen.png')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/generic-music-screen.png')))
        fs.writeFileSync(process.env.DATABASE + '/images/generic-music-screen.png', data)
    }
    if (!fs.existsSync(process.env.DATABASE + '/images/loading-screen.png')) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources/loading-screen.png')))
        fs.writeFileSync(process.env.DATABASE + '/images/loading-screen.png', data)
    }
    if (!fs.existsSync( path.join(process.env.DATABASE, 'custom.css') )) {
        let data = fs.readFileSync(path.resolve(path.join(__dirname, 'resources', 'default-custom.css')))
        fs.writeFileSync( path.join(process.env.DATABASE, 'custom.css'), data)
    }

}


function _wait(t) {
    return new Promise((resolve) => {
      setTimeout(resolve, t);
    });
}


async function sendEventAfterTime() {
    let t = (new Date()).getTime();
    await _wait(20000);
    eventService.push(
        "lifecycle",
        {
            "message": `Server Started`,
            "detail" : {
                "time": t,
            },
            "level" : "success"
        }
    );
    
}
sendEventAfterTime();


onShutdown("log" , [],  async() => {
    let t = (new Date()).getTime();
    eventService.push(
        "lifecycle",
        {
            "message": `Initiated Server Shutdown`,
            "detail" : {
                "time": t,
            },
            "level" : "warning"
        }
    );

    console.log("Received exit signal, attempting graceful shutdown...");
    await _wait(2000);
});
onShutdown("xmltv-writer" , [],  async() => {
    await xmltv.shutdown();
} );

