---
template: blog-post
title: Using NPM Libraries in Firefox via Webpack
date: 2017-07-11 9:50:00 -0700
tags:
  - mozilla
---
I work on a [system add-on][] for Firefox called the [Shield Recipe Client][]. We develop it in a [monorepo on Github][normandy] along with the service it relies on and a few other libraries. One of these libraries is [mozJexl][], an expression language that we use to specify how to filter experiments and surveys we send to users.

The system add-on relies on mozJexl, and for a while we were pulling in the dependency by copying it from `node_modules` and using a [custom CommonJS loader][loader] to make `require()` calls work properly. This wasn't ideal for a few reasons:

- We had to determine manually which file contained the exports we needed, instead of being able to use the documented exports that you'd get from a `require()` call.

- Because library files could `require()` any other file within `node_modules` we copied the entire directory within our add-on.

- We didn't hit this with mozJexl, but I'm pretty sure that if a library we wanted to include had dependencies of its own, our custom loader wouldn't have resolved the paths properly.

While working on another patch, I hit a point where I wanted to pull in [ajv][] to do some schema validation and decided to see if I could come up with something better.

[system add-on]: http://gecko.readthedocs.io/en/latest/toolkit/mozapps/extensions/addon-manager/SystemAddons.html
[Shield Recipe Client]: http://normandy.readthedocs.io/en/latest/dev/recipe-client-addon/index.html
[normandy]: https://github.com/mozilla/normandy
[mozJexl]: https://github.com/mozilla/normandy/tree/master/mozjexl
[loader]: https://developer.mozilla.org/en-US/Add-ons/SDK/Low-Level_APIs/_loader
[ajv]: http://epoberezkin.github.io/ajv/

## Webpack

I already knew that a few components within Firefox are using [Webpack][], such as [debugger.html][] and [Activity Stream][]. As far as I can tell, they bundle all of their code together, which is standard for Webpack.

I wanted to avoid this, because we sometimes get fixes from Firefox developers that we upstream back to Github. We also get help in the form of debugging from developers investigating issues that lead back to our add-on. Both of these would be made more difficult by landing webpacked code that is different from the source code we normally work on.

Instead, my goal was to webpack only the libraries that we want to use in a way that provided a similar experience to `require()`. Here's the Webpack configuration that I came up with:

```js
/* eslint-env node */
var path = require("path");
var ConcatSource = require("webpack-sources").ConcatSource;
var LicenseWebpackPlugin = require("license-webpack-plugin");

module.exports = {
  context: __dirname,
  entry: {
    mozjexl: "./node_modules/mozjexl/",
  },
  output: {
    path: path.resolve(__dirname, "vendor/"),
    filename: "[name].js",
    library: "[name]",
    libraryTarget: "this",
  },
  plugins: [
    /**
     * Plugin that appends "this.EXPORTED_SYMBOLS = ["libname"]" to assets
     * output by webpack. This allows built assets to be imported using
     * Cu.import.
     */
    function ExportedSymbols() {
      this.plugin("emit", function(compilation, callback) {
        for (const libraryName in compilation.entrypoints) {
          const assetName = `${libraryName}.js`; // Matches output.filename
          compilation.assets[assetName] = new ConcatSource(
            "/* eslint-disable */", // Disable linting
            compilation.assets[assetName],
            `this.EXPORTED_SYMBOLS = ["${libraryName}"];` // Matches output.library
          );
        }
        callback();
      });
    },
    new LicenseWebpackPlugin({
      pattern: /^(MIT|ISC|MPL.*|Apache.*|BSD.*)$/,
      filename: `LICENSE_THIRDPARTY`,
    }),
  ],
};
```

(See also [the pull request itself][pull-request].)

Each entry point in the config is a library that we want to use, with the key being the name we're using to export it, and the value being the path to its directory in `node_modules`[^1]. The output of this config is one file per entry point inside a `vendor` subdirectory. You can then import these files as if they were normal `.jsm` files:

```js
Cu.import("resource://shield-recipe-client/vendor/mozjexl.js");
const jexl = new moxjexl.Jexl();
```

[Webpack]: https://webpack.github.io/
[debugger.html]: https://devtools-html.github.io/debugger.html/
[Activity Stream]: https://testpilot.firefox.com/experiments/activity-stream
[pull-request]: https://github.com/mozilla/normandy/pull/877

## output.library

The key turned out to be Webpack's options for bundling libraries:

- [`output.library`][output.library]: Name of the library you want to export.
- [`output.libraryTarget`][output.libraryTarget]: How you want to expose your library.

By setting `output.library` to a name like `mozJexl`, and `output.libraryTarget` to `this`, you can produce a bundle that assigns the exports from your entry point to `this.mozJexl`. In the configuration above, I use the webpack variable `[name]` to set it to the name for each export, since we're exporting multiple libraries with one config.

[output.library]: https://webpack.js.org/configuration/output/#output-library
[output.libraryTarget]: https://webpack.js.org/configuration/output/#output-librarytarget

## ExportedSymbols

Assuming that the bundle will work in a chrome environment, this is very close to being a [JavaScript code module][]. The only thing missing is `this.EXPORTED_SYMBOLS` to define what names we're exporting. Luckily, we already know the name of the symbols being exported, and we know the filename that will be used for each entry point.

I used this info to write a small Webpack plugin that prepends an [eslint][]-ignore comment to the start of each generated file (since we don't want to lint bundled code) and `this.EXPORTED_SYMBOLS` to the end of each generated file:

```js
function ExportedSymbols() {
  this.plugin("emit", function(compilation, callback) {
    for (const libraryName in compilation.entrypoints) {
      const assetName = `${libraryName}.js`; // Matches output.filename
      compilation.assets[assetName] = new ConcatSource(
        "/* eslint-disable */", // Disable linting
        compilation.assets[assetName],
        `this.EXPORTED_SYMBOLS = ["${libraryName}"];` // Matches output.library
      );
    }
    callback();
  });
}
```

[JavaScript code module]: https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
[eslint]: http://eslint.org/

## Licenses

During code review, [mythmon][] brought up an excellent question; how do we retain licensing info for these files when we sync to mozilla-central? Turns out, there's a rather popular Webpack plugin called [license-webpack-plugin][] that collects license files found during a build and outputs them into a single file:

```js
new LicenseWebpackPlugin({
  pattern: /^(MIT|ISC|MPL.*|Apache.*|BSD.*)$/,
  filename: `LICENSE_THIRDPARTY`,
}),
```

(Why MIT/ISC/MPL/etc.? I just used what I thought were common licenses for libraries we were likely to use.)

[mythmon]: http://www.mythmon.com/
[license-webpack-plugin]: https://www.npmjs.com/package/license-webpack-plugin

## Future Improvements

This is already a useful improvement over our old method of pulling in dependencies, but there are some potential improvements I'd eventually like to get to:

- The file size of third-party libraries is not insignificant, especially with their own dependencies. I'd like to consider minifying the bundles, potentially with source maps to aid debugging. I'm not even sure that's a thing for chrome code, though.

- Some libraries may rely on browser globals, like `fetch`. I'd like to figure out how to auto-prepend [Components.utils.importGlobalProperties][import-global] to library files that need certain globals that aren't normally available.

- If several system add-ons use this pattern, we might end up with multiple copies of the same library in mozilla-central. Deduplicating this code where possible would be nice.

- If there's enough interest in it, I'd be interested in pulling this pattern out into some sort of plugin/preset so that other system add-ons can also use npm libraries with ease.

[import-global]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Language_Bindings/Components.utils.importGlobalProperties

[^1]: Did you know that Webpack will automatically use the main module defined in `package.json` as the entry point if the path points to a directory with that file?
