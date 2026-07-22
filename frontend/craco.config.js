process.env.CI = "false";

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add browser polyfill fallbacks for Node modules (e.g. face-api.js)
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        fs: false,
        path: false,
        crypto: false
      };

      // Suppress source map warnings from node_modules (especially face-api.js)
      webpackConfig.module.rules = webpackConfig.module.rules.map((rule) => {
        if (rule.enforce === 'pre' && rule.use && Array.isArray(rule.use)) {
          const sourceMapLoaderIndex = rule.use.findIndex(
            (use) => use.loader && use.loader.includes('source-map-loader')
          );
          if (sourceMapLoaderIndex !== -1) {
            // Modify source-map-loader to ignore errors from node_modules
            rule.use[sourceMapLoaderIndex] = {
              ...rule.use[sourceMapLoaderIndex],
              options: {
                ...(rule.use[sourceMapLoaderIndex].options || {}),
                filterSourceMappingUrl: (url, resourcePath) => {
                  // Skip source map warnings from node_modules
                  if (resourcePath && resourcePath.includes('node_modules')) {
                    return 'skip';
                  }
                  return url;
                },
              },
            };
          }
        }
        return rule;
      });

      return webpackConfig;
    },
  },
};
