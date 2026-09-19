const { withAppDelegate, withXcodeProject } = require('expo/config-plugins');

// O SDK 57 do Expo traz a classe ExpoAppSceneDelegate mas o template do prebuild
// ainda nao a conecta. Sem isso o iOS 27 mata o app no launch
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption / EXC_BREAKPOINT).
// Aqui o AppDelegate passa a conformar ao provider e deixa a janela e o start do
// React Native por conta do scene delegate, declarado no UIApplicationSceneManifest.
const WINDOW_SETUP = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow[\s\S]*?#endif\n/;

const withSceneLifecycle = (config) =>
  withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('ExpoReactNativeFactoryProvider')) {
      contents = contents.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
      );
    }

    contents = contents.replace(
      WINDOW_SETUP,
      '    // A janela e o start do React Native ficam com o ExpoAppSceneDelegate.\n'
    );

    cfg.modResults.contents = contents;
    return cfg;
  });

// O sandbox de scripts do Xcode impede a fase "Bundle React Native code and images"
// de escrever o main.jsbundle em DerivedData (EPERM). Projetos React Native o desligam.
const withoutScriptSandboxing = (config) =>
  withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const configs = proj.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const settings = configs[key].buildSettings;
      if (settings && 'ENABLE_USER_SCRIPT_SANDBOXING' in settings) {
        settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });

module.exports = (config) => withoutScriptSandboxing(withSceneLifecycle(config));
