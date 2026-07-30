const i18n = require('i18n');

// Configure i18n
i18n.configure({
    locales: ['en', 'ar'],
    directory: __dirname + '/../locales',
    defaultLocale: 'en',
    cookie: 'lang',
    queryParameter: 'lang',
    autoReload: true,
    updateFiles: false
});

// Language detection middleware
function detectLanguage(req, res, next) {
    // Check URL parameter: ?lang=ar
    const queryLang = req.query.lang;
    if (queryLang && ['en', 'ar'].includes(queryLang)) {
        req.setLocale(queryLang);
        res.cookie('lang', queryLang);
        return next();
    }

    // Check cookie
    const cookieLang = req.cookies?.lang;
    if (cookieLang && ['en', 'ar'].includes(cookieLang)) {
        req.setLocale(cookieLang);
        return next();
    }

    // Check Accept-Language header
    const acceptLang = req.headers['accept-language']?.split(',')[0]?.substring(0, 2);
    if (acceptLang && ['en', 'ar'].includes(acceptLang)) {
        req.setLocale(acceptLang);
        return next();
    }

    // Default to English
    req.setLocale('en');
    next();
}

module.exports = {
    i18n,
    detectLanguage
};