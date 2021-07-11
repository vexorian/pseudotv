module.exports = function ($http, $q) {
    return {
        getPlugins: () => {
            return $http.get('/api/plugins').then((d) => { return d.data })
        },
        postInstallPlugin: (pluginData) => {
            return $http.post('/api/plugins/install', {data: pluginData}).then((d) => { return d.data })
        },
        postRemovePlugin: (pluginData) => {
            return $http.post('/api/plugins/remove', {data: pluginData}).then((d) => { return d.data })
        },
        getNeedToRestart: () => {
            return $http.get('/api/plugins/need-restart').then((d) => { return d.data })
        },
    }
}