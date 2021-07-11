const fs = require('fs');
const path = require('path');
const request = require('request');
const StreamZip = require('node-stream-zip');
const Del = require('del');


/**
 *  Manager Plugin Database, Files and Events
 *
 * @class PluginManager
 */
class PluginManager {
    /**
     * Creates an instance of PluginManager.
     * @param {*} pluginFolder
     * @param {*} dataBase
     * @param {*} eventService
     * @memberof PluginManager
     */
    constructor(pluginFolder, dataBase, eventService) {
        this.downloadInProgress = null;
        this.installationInProgress = null;
        this.db = dataBase['plugin-manager'];
        this.dbSettings = dataBase['settings'];
        this.pluginsFolder = pluginFolder;
    }

    /**
     * Download ZIP of github repository, and save this on user's plugins folder.
     * 
     * @param {object} pluginObject 
     */
    downloadPlugin(pluginObject) {
        return new Promise((resolve, reject) => {
            const githubId = pluginObject.repository
            const folderName = pluginObject.repository.split('/')[1];
            const zipPath = path.join(this.pluginsFolder, `${folderName}.zip`);

            if(fs.existsSync(zipPath)) {
                this.installPlugin(pluginObject);
                this.installationInProgress = null;
                resolve({status: 200, msg: `Unpacking zip file.`});
                return;
            }

            const tempFile = fs.createWriteStream(path.join(this.pluginsFolder, `${folderName}.zip`));

            let received_bytes = 0;
            let total_bytes = 0;
            let percentage = 0;

            request.get(`https://github.com/${githubId}/archive/refs/heads/master.zip`)
                .on( 'response', function ( data ) {
                    total_bytes = parseInt(data.headers['content-length']);
                })
                .on('data', function (chunk) {
                    received_bytes += chunk.length;
                    percentage = ((received_bytes * 100) / total_bytes).toFixed(2);
                    this.installationInProgress = percentage;
                })
                .on('end', () => {
                    this.installPlugin(pluginObject);
                    this.installationInProgress = null;
                })
                .pipe(tempFile);

            resolve({status: 200, msg: `Download Started.`});
        });
    }

    /**
     * Install a plugin extracting your content
     *
     * @param {*} pluginObject
     * @memberof PluginManager
     */
    async installPlugin(pluginObject) {
        try {
            const folderName = pluginObject.repository.split('/')[1];
            const file = path.join(this.pluginsFolder, `${folderName}.zip`);

            if(fs.existsSync(file)) {
                const zip = new StreamZip.async({ file });
                const entries = await zip.entries();
                const distFolder = `${folderName}-master/dist/`;
                if(distFolder in entries) {
                    await zip.extract(distFolder, `${this.pluginsFolder}/${folderName}`);
                    const message = `Plugin ${folderName} installed.`;
                    this.sendNotification(message, 'plugin.install');
                    this.needToRestartServer();
                    console.log(message);
                    this.savePluginOnDb(pluginObject);
                }
                await zip.close();
                fs.rm(file, () => {
                    console.log('File Deleted:', file);
                });
            }
        } catch (error) {
            console.log(error);
        }
        

    }

    /**
     * Remover a plugin and delete your folder
     *
     * @param {*} pluginObject
     * @return {*} 
     * @memberof PluginManager
     */
    uninstallPlugin(pluginObject) {
        return new Promise(async (resolve, reject) => {
            const folderName = pluginObject.repository.split('/')[1];
            const file = path.join(this.pluginsFolder, `${folderName}`);
            await Del(file);
            this.removePluginFromDb(pluginObject);
            this.needToRestartServer();
            const message = `Plugin "${folderName}" Removed.`;
            this.sendNotification(message, 'plugin.uninstall');
            resolve(message);
        });
    }

    /**
     * Store data of plugin's installed on Database
     *
     * @param {*} pluginObject
     * @memberof PluginManager
     */
    savePluginOnDb(pluginObject) {

        const {
            name,
            scope,
            hooks,
            repository,
            summary,
            cover,
            feature,
        } = pluginObject;

        if(!this.db.find({repository})[0]) {
            this.db.save({
                name,
                scope,
                hooks,
                repository,
                summary,
                cover,
                feature
            });
        }
    }

    /**
     * Remove plugin data from Database
     *
     * @param {*} pluginObject
     * @memberof PluginManager
     */
    removePluginFromDb(pluginObject) {
        const {repository} = pluginObject;
        if(this.db.find({repository})[0]) {
            this.db.remove({repository});
        }
    }

    /**
     * Send notification to web
     *
     * @param {*} message
     * @param {*} event
     * @param {string} [level='success']
     * @memberof PluginManager
     */
    sendNotification(message, event, level = 'success') {
        const time = (new Date()).getTime();

        eventService.push(
            "lifecycle",                                                                                                                                
            {
                message,                                                                                              
                "detail" : {
                    time,
                    event   
                },
                "level" : level
            }
        );
    }

    /**
     * List plugins available to installation.
     * Plugin list is from plugins.json
     *
     * @return {*} 
     * @memberof PluginManager
     */
    listPluginsAvailable() {
        return new Promise((resolve, reject) => {
            try {
                fs.readFile(path.join(__dirname, 'plugins.json'), {
                    encoding:'utf8'
                }, (error, data) => {
                    if(error) {
                        throw Error(error);
                    }
                    resolve(
                        JSON.parse(data)
                    );
                });
            } catch (error) {
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * List plugins with installed flag
     *
     * @return {*} 
     * @memberof PluginManager
     */
    async listPluginsAvailableAndInstalled() {
        let finalList = null;

        const installedPlugins = this.db.find();
        const pluginList = await this.listPluginsAvailable();
        finalList = pluginList.map(pluginAvailable => {
            pluginAvailable.installed = installedPlugins.some(
                plugin => plugin.repository === pluginAvailable.repository
            );
            return pluginAvailable;
        });

        installedPlugins.map(pluginInstalled => {
            const find = installedPlugins.some(
                plugin => plugin.repository === pluginInstalled.repository
            );

            if(!find) {
                pluginInstalled.installed = true;
                finalList.push(pluginInstalled);
            }
        });

        return finalList;
    }

    /**
     * Store on Database 'settings' the necessity of a reboot on dizqueTV
     *
     * @memberof PluginManager
     */
    needToRestartServer() {
        const restartSettingQuery = {setting: 'serverRestart'};
        if(this.dbSettings.find(restartSettingQuery)[0]) {
            this.dbSettings.update(restartSettingQuery, {setting: 'serverRestart', value: true});
        } else {
            this.dbSettings.save({setting: 'serverRestart', value: true});
        }

    }
}

module.exports = PluginManager;