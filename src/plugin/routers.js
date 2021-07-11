const express = require('express');
const PluginManager = require('./manager');

/**
 * Routers of Plugin System
 *
 * @class PluginsRoutes
 */
class PluginsRoutes {

    /**
     * Creates an instance of PluginsRoutes.
     * @param {*} pluginsFolder
     * @param {*} dataBase
     * @param {*} eventService
     * @memberof PluginsRoutes
     */
    constructor(pluginsFolder, dataBase, eventService) {
        this.pluginsFolder = pluginsFolder;
        this.router = express.Router();
        this.db = dataBase;
        this.pluginManager = new PluginManager(this.pluginsFolder, this.db, eventService);
    }
    
    /**
     * Return a list with all plugins
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof PluginsRoutes
     */
    async getList(req, res, next) {
        try {
            const pluginsList = await this.pluginManager.listPluginsAvailableAndInstalled();
            res.status(200).json(pluginsList);
        } catch (error) {
            console.error(error);
            res.status(500).send("error");
        }
    }

    /**
     * Install a Plugin
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof PluginsRoutes
     */
    async postInstall(req, res, next) {
        try {
            if('data' in req.body){
                console.log(req.body);
                const response = await this.pluginManager.downloadPlugin(req.body.data);
                res.status(200).json({
                    msg: response
                });
            } else {
                throw new Error({status: 400, msg: "You need to send Data!"})
            }
        } catch (error) {
            res.status(400).send(error);
        }
    }

    /**
     * Uninstall a Plugin
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof PluginsRoutes
     */
    async postRemovePlugin(req, res, next) {
        try {
            console.log(req.body);
            const response = await this.pluginManager.uninstallPlugin(req.body.data);
            res.status(200).json({
                msg: response
            });
        } catch (error) {
            console.error(error);
            res.status(500).send("error");
        }
    }

    /**
     * Check if dizqueTV need to be rebooted
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     * @memberof PluginsRoutes
     */
    getNeedRestart(req, res, next) {
        try {
            const needRestart = this.db['settings'].find({setting: 'serverRestart'})[0];
            res.status(200).json({
                status: needRestart.value
            });
        } catch (error) {
            console.error(error);
            res.status(500).send("error");
        }
    }

    /**
     *  Register all routers to {api}/plugins
     *
     * @return {*} 
     * @memberof PluginsRoutes
     */
    registerRoutes() {
        this.router.get('/', async (req, res, next) => this.getList(req, res, next));
        this.router.get('/need-restart', async (req, res, next) => this.getNeedRestart(req, res, next));
        this.router.post('/install', async (req, res, next) => this.postInstall(req, res, next));
        this.router.post('/remove', async (req, res, next) => this.postRemovePlugin(req, res, next));

        return this.router;
    }
}

module.exports = PluginsRoutes;