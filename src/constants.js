const path = require('path');

module.exports = {
    SLACK: 9999,
    TVGUIDE_MAXIMUM_PADDING_LENGTH_MS:    30*60*1000,
    DEFAULT_GUIDE_STEALTH_DURATION: 5 * 60* 1000,
    TVGUIDE_MAXIMUM_FLEX_DURATION : 6 * 60 * 60 * 1000,
    TOO_FREQUENT: 100,
    DEFAULT_WEB_UI_PUBLIC: path.join(__dirname, '../', 'web','public'),

    VERSION_NAME: "1.5.0-development"
}
