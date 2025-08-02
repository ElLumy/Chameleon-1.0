// content/chameleon-main.js
(function() {
  'use strict';
  
  // Verificar que no se ejecute múltiples veces
  if (window.__chameleonMainInitialized) {
    console.warn('[Chameleon Main] Already initialized');
    return;
  }
  
  window.__chameleonMainInitialized = true;
  
  console.log('[Chameleon Main] Starting initialization...');
  
  // Estado global
  const ChameleonState = {
    seed: null,
    profile: null,
    initialized: false,
    platform: null,
    profilesData: null,
    modules: {}
  };
  
  // Sistema de comunicación con el injector
  class ChameleonBridge {
    constructor() {
      this.pendingRequests = new Map();
      this.requestId = 0;
      
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CHAMELEON_RESPONSE') {
          const handler = this.pendingRequests.get(event.data.action);
          if (handler) {
            handler(event.data.data);
            this.pendingRequests.delete(event.data.action);
          }
        }
      });
    }
    
    async request(action, data = {}) {
      return new Promise((resolve) => {
        this.pendingRequests.set(action, resolve);
        
        window.postMessage({
          type: 'CHAMELEON_REQUEST',
          action: action,
          ...data
        }, '*');
        
        // Timeout
        setTimeout(() => {
          if (this.pendingRequests.has(action)) {
            this.pendingRequests.delete(action);
            resolve(null);
          }
        }, 5000);
      });
    }
  }
  
  const bridge = new ChameleonBridge();
  
  // Cargar datos de perfiles
  async function loadProfilesData() {
    try {
      const response = await fetch(chrome.runtime.getURL('data/profiles.json'));
      if (!response.ok) {
        throw new Error('Failed to load profiles data');
      }
      return await response.json();
    } catch (error) {
      console.error('[Chameleon Main] Failed to load profiles data:', error);
      return null;
    }
  }
  
  // Obtener semilla de sesión
  async function getSessionSeed() {
    const response = await bridge.request('getSessionSeed');
    if (response && response.seed) {
      return response.seed;
    }
    
    // Fallback: generar localmente
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Generador de perfiles
  function ProfileGenerator(profilesData, seed) {
    const rng = new Math.seedrandom(seed);
    
    function selectWeighted(items) {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let random = rng() * totalWeight;
      
      for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
      }
      
      return items[items.length - 1];
    }
    
    function selectFromArray(array) {
      return array[Math.floor(rng() * array.length)];
    }
    
    function generate() {
      const archetype = selectWeighted(profilesData.deviceArchetypes);
      
      const cpu = selectWeighted(
        archetype.hardware.cpu.cores.map((c, i) => ({
          value: c,
          weight: archetype.hardware.cpu.weights[i]
        }))
      ).value;
      
      const memory = selectFromArray(archetype.hardware.memory);
      const gpu = selectFromArray(archetype.hardware.gpuVendors);
      const gpuModel = selectFromArray(gpu.models);
      const resolution = selectWeighted(archetype.display.resolutions);
      
      const language = selectWeighted(
        archetype.languages.primary.map((l, i) => ({
          value: l,
          weight: archetype.languages.weights[i]
        }))
      ).value;
      
      const regions = Object.entries(profilesData.timezoneRegions);
      const region = selectWeighted(
        regions.map(([name, zones]) => ({
          value: { name, zones },
          weight: zones.reduce((sum, z) => sum + z.weight, 0)
        }))
      );
      
      const timezoneData = selectWeighted(region.value.zones);
      const chromeVersion = selectWeighted(profilesData.chromeVersions);
      
      let userAgent = archetype.userAgentTemplate.replace('{chromeVersion}', chromeVersion.version);
      
      if (archetype.platform === 'Linux armv8l') {
        const deviceModel = selectFromArray(profilesData.androidDeviceModels);
        userAgent = userAgent
          .replace('{androidVersion}', archetype.os.version)
          .replace('{deviceModel}', deviceModel);
      }
      
      const plugins = [];
      if (archetype.platform !== 'Linux armv8l') {
        plugins.push({
          name: 'PDF Viewer',
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          mimeTypes: [{
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format'
          }]
        });
        
        if (rng() > 0.5) {
          plugins.push({
            name: 'Chrome PDF Viewer',
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            mimeTypes: [{
              type: 'application/pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format'
            }]
          });
        }
      }
      
      const webglExtensions = [
        'EXT_blend_minmax',
        'EXT_color_buffer_half_float',
        'EXT_float_blend',
        'EXT_frag_depth',
        'EXT_texture_compression_bptc',
        'EXT_texture_filter_anisotropic',
        'WEBGL_compressed_texture_s3tc',
        'WEBGL_compressed_texture_s3tc_srgb',
        'WEBGL_debug_renderer_info',
        'WEBGL_depth_texture',
        'WEBGL_lose_context'
      ];
      
      if (gpu.vendor === 'NVIDIA') {
        webglExtensions.push('NV_shader_noperspective_interpolation');
      }
      
      const fontKey = archetype.os.name.toLowerCase();
      const allFonts = archetype.fonts?.[fontKey] || archetype.fonts?.windows || [];
      const basicFonts = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'];
      const selectedFonts = new Set(basicFonts);
      
      const additionalCount = Math.floor(rng() * 15) + 20;
      const availableFonts = allFonts.filter(f => !basicFonts.includes(f));
      
      for (let i = 0; i < additionalCount && availableFonts.length > 0; i++) {
        const index = Math.floor(rng() * availableFonts.length);
        selectedFonts.add(availableFonts.splice(index, 1)[0]);
      }
      
      return {
        seed: seed,
        archetype: archetype.id,
        summary: `${archetype.name} - ${resolution.width}x${resolution.height} - ${timezoneData.timezone}`,
        navigator: {
          userAgent: userAgent,
          platform: archetype.platform,
          language: language,
          languages: [language, language.split('-')[0], 'en-US', 'en'].filter((v, i, a) => a.indexOf(v) === i),
          hardwareConcurrency: cpu,
          deviceMemory: memory,
          maxTouchPoints: archetype.display.touchPoints,
          vendor: 'Google Inc.',
          vendorSub: '',
          productSub: '20030107',
          cookieEnabled: true,
          onLine: true,
          webdriver: false,
          pdfViewerEnabled: true,
          plugins: plugins,
          doNotTrack: null
        },
        screen: {
          width: resolution.width,
          height: resolution.height,
          availWidth: resolution.width,
          availHeight: resolution.height - 40,
          colorDepth: archetype.display.colorDepth,
          pixelDepth: archetype.display.pixelDepth,
          orientation: {
            angle: 0,
            type: resolution.width > resolution.height ? 'landscape-primary' : 'portrait-primary'
          }
        },
        webgl: {
          vendor: gpu.vendor,
          renderer: gpu.renderer.replace('{model}', gpuModel),
          version: 'WebGL 2.0',
          shadingLanguageVersion: 'WebGL GLSL ES 3.00',
          extensions: webglExtensions.sort(() => rng() - 0.5)
        },
        canvas: {
          noise: rng() * 0.0001 + 0.00005,
          offsetX: Math.floor(rng() * 3) - 1,
          offsetY: Math.floor(rng() * 3) - 1
        },
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          noise: rng() * 0.00002 + 0.00001
        },
        timezone: {
          name: timezoneData.timezone,
          offset: getTimezoneOffset(timezoneData.timezone),
          locale: language
        },
        fonts: Array.from(selectedFonts).sort(),
        battery: {
          charging: rng() > 0.3,
          level: Math.round((0.2 + rng() * 0.8) * 100) / 100,
          chargingTime: rng() > 0.3 ? Math.floor(rng() * 3600) : Infinity,
          dischargingTime: Math.floor(rng() * 10800 + 3600)
        }
      };
    }
    
    function getTimezoneOffset(timezone) {
      const offsets = {
        'America/New_York': 300,
        'America/Chicago': 360,
        'America/Los_Angeles': 480,
        'America/Toronto': 300,
        'America/Mexico_City': 360,
        'Europe/London': 0,
        'Europe/Paris': -60,
        'Europe/Berlin': -60,
        'Europe/Madrid': -60,
        'Europe/Rome': -60
      };
      
      return offsets[timezone] || 0;
    }
    
    return { generate };
  }
  
  // Detectar plataforma
  function detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('facebook.com') || hostname.includes('meta.com')) return 'meta';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('fingerprint.com')) return 'fingerprint';
    
    return 'other';
  }
  
  // Inicialización principal
  async function initialize() {
    try {
      console.log('[Chameleon Main] Loading profiles data...');
      ChameleonState.profilesData = await loadProfilesData();
      if (!ChameleonState.profilesData) {
        throw new Error('Profiles data not loaded');
      }
      
      console.log('[Chameleon Main] Getting session seed...');
      ChameleonState.seed = await getSessionSeed();
      console.log('[Chameleon Main] Session seed:', ChameleonState.seed.substring(0, 8) + '...');
      
      console.log('[Chameleon Main] Generating profile...');
      const generator = ProfileGenerator(ChameleonState.profilesData, ChameleonState.seed);
      ChameleonState.profile = generator.generate();
      console.log('[Chameleon Main] Generated profile:', ChameleonState.profile.summary);
      
      ChameleonState.platform = detectPlatform();
      console.log('[Chameleon Main] Detected platform:', ChameleonState.platform);
      
      // Aplicar interceptores usando los módulos
      console.log('[Chameleon Main] Applying interceptors...');
      
      // Meta Proxy debe ser primero
      if (window.MetaProxyInterceptor) {
        const metaProxy = new window.MetaProxyInterceptor();
        metaProxy.apply();
        ChameleonState.modules.metaProxy = metaProxy;
      }
      
      // Navigator
      if (window.NavigatorInterceptor) {
        const navigator = new window.NavigatorInterceptor(ChameleonState.profile, ChameleonState);
        navigator.apply();
        ChameleonState.modules.navigator = navigator;
      }
      
      // Screen
      if (window.ScreenInterceptor) {
        const screen = new window.ScreenInterceptor(ChameleonState.profile, ChameleonState);
        screen.apply();
        ChameleonState.modules.screen = screen;
      }
      
      // Canvas
      if (window.CanvasInterceptor) {
        const canvas = new window.CanvasInterceptor(ChameleonState.profile, ChameleonState);
        canvas.apply();
        ChameleonState.modules.canvas = canvas;
      }
      
      // WebGL
      if (window.WebGLInterceptor) {
        const webgl = new window.WebGLInterceptor(ChameleonState.profile, ChameleonState);
        webgl.apply();
        ChameleonState.modules.webgl = webgl;
      }
      
      // Audio
      if (window.AudioInterceptor) {
        const audio = new window.AudioInterceptor(ChameleonState.profile, ChameleonState);
        audio.apply();
        ChameleonState.modules.audio = audio;
      }
      
      // Timezone
      if (window.TimezoneInterceptor) {
        const timezone = new window.TimezoneInterceptor(ChameleonState.profile, ChameleonState);
        timezone.apply();
        ChameleonState.modules.timezone = timezone;
      }
      
      ChameleonState.initialized = true;
      console.log('[Chameleon Main] Initialization complete!');
      
      // Guardar perfil para el popup
      await bridge.request('saveProfile', {
        profile: {
          seed: ChameleonState.profile.seed,
          summary: ChameleonState.profile.summary,
          archetype: ChameleonState.profile.archetype,
          navigator: {
            userAgent: ChameleonState.profile.navigator.userAgent,
            language: ChameleonState.profile.navigator.language,
            hardwareConcurrency: ChameleonState.profile.navigator.hardwareConcurrency,
            deviceMemory: ChameleonState.profile.navigator.deviceMemory,
            platform: ChameleonState.profile.navigator.platform
          },
          screen: {
            width: ChameleonState.profile.screen.width,
            height: ChameleonState.profile.screen.height
          },
          timezone: ChameleonState.profile.timezone,
          webgl: {
            vendor: ChameleonState.profile.webgl.vendor,
            renderer: ChameleonState.profile.webgl.renderer
          }
        }
      });
      
      console.log('[Chameleon Main] Profile saved to storage');
      
      // Exponer estado para debugging
      window.__chameleonState = ChameleonState;
      
    } catch (error) {
      console.error('[Chameleon Main] Initialization failed:', error);
    }
  }
  
  // Esperar a que los módulos estén cargados
  function waitForModules() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50;
      
      const check = () => {
        attempts++;
        
        // Verificar que los módulos principales estén cargados
        if (window.Math.seedrandom && 
            window.MetaProxyInterceptor && 
            window.NavigatorInterceptor &&
            window.ScreenInterceptor) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 100);
        } else {
          console.error('[Chameleon Main] Modules not loaded');
          resolve(); // Continue anyway
        }
      };
      
      check();
    });
  }
  
  // Iniciar cuando esté listo
  waitForModules().then(initialize);
  
})();