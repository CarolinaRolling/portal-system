module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        path: false,
        fs: false,
        crypto: false,
      };
      return webpackConfig;
    },
  },
};
