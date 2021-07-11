module.exports = function (pluginsService, $timeout) {
    return {
        restrict: 'E',
        templateUrl: 'templates/plugin-settings.html',
        replace: true,
        scope: {
        },
        link: function (scope, element, attrs) {

            function getPlugins() {
                scope.busy = true;
                pluginsService.getPlugins().then((plugins) => {
                    scope.plugins = plugins
                }).finally(() => {
                    scope.busy = false;
                });
            }

            function installPlugin(pluginData) {
                scope.busy = true;
                pluginsService.postInstallPlugin(pluginData).then((response) => {
                    console.warn(response);
                }).finally(() => {
                    scope.busy = false;
                });
            }
            
            function removePlugin(pluginData) {
                scope.busy = true;
                pluginsService.postRemovePlugin(pluginData).then((response) => {
                    console.warn(response);
                }).finally(() => {
                    scope.busy = false;
                });
            }
            

            function init() {
                scope.busy = true;
                getPlugins();
            }

            init();

            scope.installPlugin = installPlugin;
            scope.removePlugin = removePlugin;
        }
    }
}