module.exports = function ($scope, $location) {
    $scope.selected = $location.search().active || 'xmltv';

    function changeTab(name) {
        $scope.selected = name;
        $location.search('active', name);
    }

    $scope.changeTab = changeTab;
}