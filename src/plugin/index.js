const fs = require('fs');
const path = require('path');
const Hooks = require('./hooks');
const PluginsRoutes = require('./routers');

const constants = require('../constants');

const Plugins = {};
/**
 * Core of Plugin System, the start point
 *
 * @class Plugin
 */
class Plugin {

    /**
     * Creates an instance of Plugin.
     * @param {*} pluginsFolder full path of .dizquetv/plugins
     * @param {*} eventService notification service
     * @param {*} userFolder full path of .dizquetv folder
     * @param {*} db database instance
     * @memberof Plugin
     */
    constructor(pluginsFolder, eventService, userFolder, db) {
        
        this.pluginsFolder = pluginsFolder;
        this.plugins = null;
        this.db = db;
        this.loadPlugins();

        this.hook = new Hooks(Plugins, userFolder);

        const pluginsRoutes = new PluginsRoutes(pluginsFolder, this.db, eventService);

        this.Routers = pluginsRoutes.registerRoutes();

        console.log('Plugins Folder:', pluginsFolder);
        console.log('Plugins:', Object.keys(Plugins));
    }

    /**
     * Load all plugins folder and register each plugin with require().
     *
     * @memberof Plugin
     */
    loadPlugins() {
        const pluginsPath = this.pluginsFolder;
        fs.readdirSync(pluginsPath).forEach(function(file) {
            const fullPluginFolderPath = path.join(pluginsPath, file);
            const fileStats = fs.statSync(fullPluginFolderPath);
            if(fileStats.isDirectory()) {
                const plugin = require(fullPluginFolderPath);
                Plugins[plugin.name] = plugin;
            }
        });
    }

    /**
     * Intercept all request for WEB files and run a htmlFilter
     * to add components from plugins on settings page
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof Plugin
     */
    async middleware(req, res, next) {
        const regexAllowed = /^\/$|^\/(templates|views)\/.*$/;

        if(regexAllowed.test(req.url)) {

            try {

                const fileName = (req.url === '/') ? 'index.html' : req.url;
                let data = fs.readFileSync(path.join(constants.DEFAULT_WEB_UI_PUBLIC, fileName), 'utf8')
                const html = await this.hook.htmlFilter(fileName, data);
                res.setHeader('Cache-Control', 'no-cache');
                res.status(200).send(html);

              } catch (err) {

                res.status(404).send('NOT FOUND');
                console.error(err);

              }
        } else {
            next();
        }
    }

    /**
     * Return a css with all plugin injected 
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof Plugin
     */
    async css(req, res, next) {
        res.setHeader('Content-type', 'text/css; charset=UTF-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).send(await this.hook.customCss());
    }

    /**
     * Return a js with all plugin injected
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof Plugin
     */
    async js(req, res, next) {
        res.setHeader('Content-type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).send(await this.hook.customJs());
    }
}

module.exports = Plugin;