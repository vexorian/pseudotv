const fs = require('fs');
const path = require('path');
const HooksTypes = require('./hooksTypes');

/**
 * Plugin's Hook
 *
 * @class Hook
 */
class Hook {

    /**
     * Creates an instance of Hook.
     * @param {*} plugins a list with plugin's instance
     * @param {*} userFolder
     * @memberof Hook
     */
    constructor(plugins, userFolder) {
        this.plugins = plugins;
        this.hookNameSpace = 'dizquetv';
        this.userFolder = userFolder;
    }

    /**
     *  Execute a specific plugin's hook on all plugins
     *
     * @param {string} hookName  full name of hook
     * @param {*} [data=null]   data for send to plugin
     * @param {Function} [cb=null] a extra function to plugin execute
     * @return {Promise} a Promise with all Plugin's Promise
     * @memberof Hook
     */
    pluginsChainHookExecutor(hookName, data = null, cb = null) {
        const queue = [];
        Object.keys(this.plugins).forEach(pluginName => {
            // console.warn(pluginName, this.plugins[pluginName])
            if(this.plugins[pluginName].hook && (hookName in this.plugins[pluginName].hook)) {
                queue.push(this.plugins[pluginName].hook[hookName](data, cb));
            }
        });

        return Promise.all(queue);
    }

    /**
     *  Build a custom css and marge with custom.css from user's folder
     *
     * @return {*} 
     * @memberof Hook
     */
    async customCss() {
        try {
            const resolveData = await this.pluginsChainHookExecutor(HooksTypes.HOOK_WEB_CUSTOM_CSS);
            let data = fs.readFileSync(path.join(this.userFolder, 'custom.css'));
            resolveData.forEach(content => data += content);
            return data;
        } catch (error) {
            console.error(error);
            return '';
        }
    }

    /**
     * Build a custom JS
     *
     * @return {*} 
     * @memberof Hook
     */
    async customJs() {
        try {
            const resolveData = await this.pluginsChainHookExecutor(HooksTypes.HOOK_WEB_CUSTOM_JS);
            let data = '';
            resolveData.forEach(content => data += content);
            return data;
        } catch (error) {
            console.error(error);
            return '';
        }
    }

    /**
     * Replace some HTML files of front-end
     *
     * @param {string} fileName  name of current requested file
     * @param {string} htmlFileData  data of current requested html
     * @return {string} html data formatted
     * @memberof Hook
     */
    async htmlFilter(fileName, htmlFileData) {
        let htmlData = htmlFileData;
        if(/\/settings\.html$/.test(fileName)) {
            htmlData = this.addSettingsComponent(htmlFileData);
        }

        return htmlData;
    }

    /**
     * Replace specific part of settings.html
     *
     * @param {string} htmlFileData
     * @return {string} html data formatted
     * @memberof Hook
     */
    async addSettingsComponent(htmlFileData) {
        try {
            const resolveData = await this.pluginsChainHookExecutor(HooksTypes.HOOK_WEB_REGISTER_SETTINGS);
            let finalMenu = '';
            let finalElements = '';
            resolveData.forEach(plugin => {
                const html = this._generateSettingsHtml(plugin);
                finalMenu += html.htmlMenu;
                finalElements += html.htmlElement;
            })

            htmlFileData = htmlFileData.replace('<!-- SETTING:MENU -->', finalMenu);
            htmlFileData = htmlFileData.replace('<!-- SETTING:ELEMENT -->', finalElements);
            return htmlFileData;
        } catch (error) {
            console.error(error);
            
        }
    }

    /**
     * Generate html content using plugin information
     *
     * @param {*} pluginData
     * @return {*} 
     * @memberof Hook
     */
    _generateSettingsHtml(pluginData) {
        const htmlMenu = `
        <li class="settings-page__menu__item" 
            ng-class="{'active': selected === '${pluginData.element}'}" 
            ng-click="selected = '${pluginData.element}'">
            ${pluginData.menuTitle}
        </li>
        `;

        const htmlElement = `
        <${pluginData.element}
            ng-if="selected == '${pluginData.element}'">
        </${pluginData.element}>
        `;
        return {
            htmlMenu,
            htmlElement
        }
    }
}

module.exports = Hook;