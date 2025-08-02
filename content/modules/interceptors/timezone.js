// content/modules/interceptors/timezone.js
export class TimezoneInterceptor {
    constructor(profile, chameleonState) {
        this.profile = profile.timezone;
        this.chameleonState = chameleonState;
    }
    
    apply() {
        console.log('[Chameleon] Applying timezone interceptor...');
        
        // Intercept Date methods
        this.interceptDate();
        
        // Intercept Intl.DateTimeFormat
        this.interceptIntlDateTimeFormat();
        
        console.log('[Chameleon] Timezone interceptor applied');
    }
    
    interceptDate() {
        // getTimezoneOffset
        const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        
        Date.prototype.getTimezoneOffset = new Proxy(originalGetTimezoneOffset, {
            apply: (target, thisArg, args) => {
                return this.profile.offset;
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(Date.prototype.getTimezoneOffset);
        }
        
        // toLocaleString and related methods
        const localeMethodstoIntercept = [
            'toLocaleString',
            'toLocaleDateString',
            'toLocaleTimeString'
        ];
        
        localeMethodstoIntercept.forEach(method => {
            const original = Date.prototype[method];
            
            Date.prototype[method] = new Proxy(original, {
                apply: (target, thisArg, args) => {
                    // Modify options to use our timezone
                    const locale = args[0] || this.profile.locale;
                    const options = args[1] || {};
                    
                    if (!options.timeZone) {
                        options.timeZone = this.profile.name;
                    }
                    
                    return Reflect.apply(target, thisArg, [locale, options]);
                }
            });
            
            if (window.chameleonRegisterIntercepted) {
                window.chameleonRegisterIntercepted(Date.prototype[method]);
            }
        });
        
        // toString methods that include timezone
        const toStringMethods = ['toString', 'toTimeString'];
        
        toStringMethods.forEach(method => {
            const original = Date.prototype[method];
            
            Date.prototype[method] = new Proxy(original, {
                apply: (target, thisArg, args) => {
                    const result = Reflect.apply(target, thisArg, args);
                    
                    // Replace timezone abbreviation
                    const tzAbbr = this.getTimezoneAbbreviation();
                    const gmtOffset = this.getGMTOffset();
                    
                    return result.replace(/GMT[+-]\d{4} \([^)]+\)/, `GMT${gmtOffset} (${tzAbbr})`);
                }
            });
            
            if (window.chameleonRegisterIntercepted) {
                window.chameleonRegisterIntercepted(Date.prototype[method]);
            }
        });
    }
    
    interceptIntlDateTimeFormat() {
        const OriginalDateTimeFormat = Intl.DateTimeFormat;
        const profile = this.profile;
        
        // Override constructor
        Intl.DateTimeFormat = new Proxy(OriginalDateTimeFormat, {
            construct: (target, args) => {
                // Modify locale and options
                const locale = args[0] || profile.locale;
                const options = args[1] || {};
                
                if (!options.timeZone) {
                    options.timeZone = profile.name;
                }
                
                return new target(locale, options);
            }
        });
        
        // Copy static methods
        Object.setPrototypeOf(Intl.DateTimeFormat, OriginalDateTimeFormat);
        Object.getOwnPropertyNames(OriginalDateTimeFormat).forEach(prop => {
            if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
                Intl.DateTimeFormat[prop] = OriginalDateTimeFormat[prop];
            }
        });
        
        // Override resolvedOptions
        const originalResolvedOptions = OriginalDateTimeFormat.prototype.resolvedOptions;
        
        OriginalDateTimeFormat.prototype.resolvedOptions = new Proxy(originalResolvedOptions, {
            apply: (target, thisArg, args) => {
                const result = Reflect.apply(target, thisArg, args);
                
                // Ensure our timezone is reported
                result.timeZone = profile.name;
                
                // Ensure locale matches
                if (!result.locale || result.locale === 'en-US') {
                    result.locale = profile.locale;
                }
                
                return result;
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(OriginalDateTimeFormat.prototype.resolvedOptions);
        }
        
        // Override supportedLocalesOf
        const originalSupportedLocalesOf = Intl.DateTimeFormat.supportedLocalesOf;
        
        Intl.DateTimeFormat.supportedLocalesOf = new Proxy(originalSupportedLocalesOf, {
            apply: (target, thisArg, args) => {
                const result = Reflect.apply(target, thisArg, args);
                
                // Ensure our locale is supported
                const locales = args[0];
                if (Array.isArray(locales) && locales.includes(profile.locale)) {
                    if (!result.includes(profile.locale)) {
                        result.push(profile.locale);
                    }
                }
                
                return result;
            }
        });
    }
    
    getTimezoneAbbreviation() {
        const abbreviations = {
            'America/New_York': 'EST',
            'America/Chicago': 'CST',
            'America/Denver': 'MST',
            'America/Los_Angeles': 'PST',
            'America/Phoenix': 'MST',
            'Europe/London': 'GMT',
            'Europe/Paris': 'CET',
            'Europe/Berlin': 'CET',
            'Europe/Moscow': 'MSK',
            'Asia/Tokyo': 'JST',
            'Asia/Shanghai': 'CST',
            'Asia/Kolkata': 'IST',
            'Australia/Sydney': 'AEDT'
        };
        
        return abbreviations[this.profile.name] || 'GMT';
    }
    
    getGMTOffset() {
        const hours = Math.floor(Math.abs(this.profile.offset) / 60);
        const minutes = Math.abs(this.profile.offset) % 60;
        const sign = this.profile.offset <= 0 ? '+' : '-';
        
        return `${sign}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
    }
}