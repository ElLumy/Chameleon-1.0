// content/modules/interceptors/audio.js
export class AudioInterceptor {
    constructor(profile, chameleonState) {
        this.profile = profile.audio;
        this.chameleonState = chameleonState;
        this.rng = new Math.seedrandom(chameleonState.seed + '_audio');
    }
    
    apply() {
        console.log('[Chameleon] Applying audio interceptor...');
        
        // Intercept AudioContext
        this.interceptAudioContext();
        
        // Intercept OfflineAudioContext
        this.interceptOfflineAudioContext();
        
        // Intercept AnalyserNode
        this.interceptAnalyserNode();
        
        // Intercept OscillatorNode
        this.interceptOscillatorNode();
        
        // Intercept DynamicsCompressorNode
        this.interceptDynamicsCompressorNode();
        
        console.log('[Chameleon] Audio interceptor applied');
    }
    
    interceptAudioContext() {
        const contexts = [
            window.AudioContext,
            window.webkitAudioContext
        ].filter(Boolean);
        
        contexts.forEach(AudioContextClass => {
            // Intercept constructor
            const OriginalAudioContext = AudioContextClass;
            const profile = this.profile;
            
            window[AudioContextClass.name] = new Proxy(OriginalAudioContext, {
                construct: (target, args) => {
                    const context = new target(...args);
                    
                    // Override properties
                    Object.defineProperty(context, 'sampleRate', {
                        get: () => profile.sampleRate,
                        configurable: true
                    });
                    
                    return context;
                }
            });
            
            // Intercept prototype methods
            this.interceptAudioContextPrototype(OriginalAudioContext.prototype);
        });
    }
    
    interceptOfflineAudioContext() {
        const contexts = [
            window.OfflineAudioContext,
            window.webkitOfflineAudioContext
        ].filter(Boolean);
        
        contexts.forEach(OfflineAudioContextClass => {
            const OriginalOfflineAudioContext = OfflineAudioContextClass;
            const profile = this.profile;
            
            window[OfflineAudioContextClass.name] = new Proxy(OriginalOfflineAudioContext, {
                construct: (target, args) => {
                    // Modify sample rate if provided
                    if (args.length >= 3) {
                        args[2] = profile.sampleRate;
                    }
                    
                    return new target(...args);
                }
            });
        });
    }
    
    interceptAudioContextPrototype(prototype) {
        // Intercept createOscillator
        const originalCreateOscillator = prototype.createOscillator;
        if (originalCreateOscillator) {
            prototype.createOscillator = new Proxy(originalCreateOscillator, {
                apply: (target, thisArg, args) => {
                    const oscillator = Reflect.apply(target, thisArg, args);
                    
                    // Add slight detuning
                    const originalFrequency = oscillator.frequency.value;
                    Object.defineProperty(oscillator.frequency, 'value', {
                        get: () => originalFrequency,
                        set: (value) => {
                            oscillator.frequency.setValueAtTime(
                                value * (1 + (this.rng() - 0.5) * 0.0001),
                                thisArg.currentTime
                            );
                        }
                    });
                    
                    return oscillator;
                }
            });
            
            if (window.chameleonRegisterIntercepted) {
                window.chameleonRegisterIntercepted(prototype.createOscillator);
            }
        }
        
        // Intercept createDynamicsCompressor
        const originalCreateDynamicsCompressor = prototype.createDynamicsCompressor;
        if (originalCreateDynamicsCompressor) {
            prototype.createDynamicsCompressor = new Proxy(originalCreateDynamicsCompressor, {
                apply: (target, thisArg, args) => {
                    const compressor = Reflect.apply(target, thisArg, args);
                    
                    // Add slight variance to default values
                    compressor.threshold.value = -24 + (this.rng() - 0.5) * 0.1;
                    compressor.knee.value = 30 + (this.rng() - 0.5) * 0.1;
                    compressor.ratio.value = 12 + (this.rng() - 0.5) * 0.1;
                    compressor.attack.value = 0.003 + (this.rng() - 0.5) * 0.0001;
                    compressor.release.value = 0.25 + (this.rng() - 0.5) * 0.001;
                    
                    return compressor;
                }
            });
            
            if (window.chameleonRegisterIntercepted) {
                window.chameleonRegisterIntercepted(prototype.createDynamicsCompressor);
            }
        }
    }
    
    interceptAnalyserNode() {
        if (!window.AnalyserNode) return;
        
        // getFloatFrequencyData
        const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
        
        AnalyserNode.prototype.getFloatFrequencyData = new Proxy(originalGetFloatFrequencyData, {
            apply: (target, thisArg, args) => {
                // Get original data
                Reflect.apply(target, thisArg, args);
                
                const array = args[0];
                if (!array) return;
                
                // Apply deterministic noise
                for (let i = 0; i < array.length; i++) {
                    // Frequency-dependent noise
                    const freq = i / array.length;
                    const noiseAmount = this.profile.noise * (1 - freq * 0.5);
                    const noise = (this.rng() - 0.5) * noiseAmount;
                    
                    array[i] += noise;
                }
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(AnalyserNode.prototype.getFloatFrequencyData);
        }
        
        // getByteFrequencyData
        const originalGetByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
        
        AnalyserNode.prototype.getByteFrequencyData = new Proxy(originalGetByteFrequencyData, {
            apply: (target, thisArg, args) => {
                Reflect.apply(target, thisArg, args);
                
                const array = args[0];
                if (!array) return;
                
                for (let i = 0; i < array.length; i++) {
                    const noise = Math.floor((this.rng() - 0.5) * 2);
                    array[i] = Math.max(0, Math.min(255, array[i] + noise));
                }
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(AnalyserNode.prototype.getByteFrequencyData);
        }
        
        // getFloatTimeDomainData
        const originalGetFloatTimeDomainData = AnalyserNode.prototype.getFloatTimeDomainData;
        
        AnalyserNode.prototype.getFloatTimeDomainData = new Proxy(originalGetFloatTimeDomainData, {
            apply: (target, thisArg, args) => {
                Reflect.apply(target, thisArg, args);
                
                const array = args[0];
                if (!array) return;
                
                for (let i = 0; i < array.length; i++) {
                    const noise = (this.rng() - 0.5) * this.profile.noise * 0.1;
                    array[i] = Math.max(-1, Math.min(1, array[i] + noise));
                }
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(AnalyserNode.prototype.getFloatTimeDomainData);
        }
        
        // getByteTimeDomainData
        const originalGetByteTimeDomainData = AnalyserNode.prototype.getByteTimeDomainData;
        
        AnalyserNode.prototype.getByteTimeDomainData = new Proxy(originalGetByteTimeDomainData, {
            apply: (target, thisArg, args) => {
                Reflect.apply(target, thisArg, args);
                
                const array = args[0];
                if (!array) return;
                
                for (let i = 0; i < array.length; i++) {
                    const noise = Math.floor((this.rng() - 0.5) * 2);
                    array[i] = Math.max(0, Math.min(255, array[i] + noise));
                }
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(AnalyserNode.prototype.getByteTimeDomainData);
        }
    }
    
    interceptOscillatorNode() {
        if (!window.OscillatorNode) return;
        
        const originalStart = OscillatorNode.prototype.start;
        
        OscillatorNode.prototype.start = new Proxy(originalStart, {
            apply: (target, thisArg, args) => {
                // Add micro-timing variance
                if (args.length > 0 && typeof args[0] === 'number') {
                    args[0] += (this.rng() - 0.5) * 0.0001;
                }
                
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(OscillatorNode.prototype.start);
        }
    }
    
    interceptDynamicsCompressorNode() {
        if (!window.DynamicsCompressorNode) return;
        
        // Properties are already modified in createDynamicsCompressor
        // This is a placeholder for any additional interception needed
    }
}