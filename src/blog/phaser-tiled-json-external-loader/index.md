---
template: blog-post
title: External Tilesets with Tiled and Phaser
date: 2019-03-03 01:10:00 -0700
tags:
  - phaser
  - gamedev
---
[Tiled][] is a popular tilemap editor, and [Phaser][] has great built-in support for it. One feature of Tiled that Phaser _doesn't_ support is external tilesets.

In Tiled, a tileset can either be internal, meaning all the data for the tileset is included in the tilemap itself, or external, meaning that the tileset is a standalone file separate from the tilemap. The main benefit of external tilesets is that they can be shared between maps. You can update and change the tileset without having to update per-tilemap copies everywhere.

Phaser, however, requires that tilesets be stored internally in the tilemaps they're used in. I finally ran into a point where I wanted multiple tilemaps in my game and wrote a custom loader that supports external tilesets.

It's called [`phaser-tiled-json-external-loader`][github], and you can install it via [NPM][] or manually download a [JavaScript bundle][] to load in your game's HTML file. The [README][] has more information on how to install and use the library. I've also got a [Glitch][] project showing the library in action:

<div class="glitch-embed-wrap">
  <iframe
    allow="geolocation; microphone; camera; midi; encrypted-media"
    src="https://glitch.com/embed/#!/embed/phaser-tiled-json-external-loader-example?path=public/client.js&previewSize=27"
    alt="phaser-tiled-json-external-loader-example on Glitch"
    style="height: 100%; width: 100%; border: 0;">
  </iframe>
</div>

[Tiled]: https://www.mapeditor.org/
[Phaser]:https://phaser.io/
[github]: https://github.com/Osmose/phaser-tiled-json-external-loader
[NPM]: https://www.npmjs.com/package/phaser-tiled-json-external-loader
[README]: https://github.com/Osmose/phaser-tiled-json-external-loader#phaser-tiled-json-external-loader
[Glitch]: https://glitch.com/
[JavaScript bundle]: https://github.com/Osmose/phaser-tiled-json-external-loader/releases

### Why doesn't Phaser support external tilesets?

I can only speculate based on the code[^1]. Phaser loads tilemaps as JSON, and doesn't actually parse that JSON until you attempt to create a tilemap object during a scene's `create` phase. While parsing the Tiled JSON, it [tries to load each tileset](https://github.com/photonstorm/phaser/blob/c85648e06a7bf1de830acb5162dd6705f98ae947/src/tilemaps/parsers/tiled/ParseTilesets.js#L35):

```js
//  name, firstgid, width, height, margin, spacing, properties
var set = json.tilesets[i];

if (set.source)
{
    console.warn('Phaser can\'t load external tilesets. Use the Embed Tileset button and then export the map again.');
}
```

At this point, we're past the `preload` step of the scene, and the API for creating tilemaps isn't asynchronous, so going back and loading another external JSON file isn't really an option at this point.

In my opinion, a "proper" fix would be similar to how the images for tilemaps are handled. Even with internal tilesets, the images used in the tilesets must be loaded separately and passed when creating a tileset:

```js
const scene = {
  preload() {
    // The tileset image is not automagically loaded by Phaser
    this.load.image('tilesetImage', 'https://cdn.glitch.com/1780c601-5e7d-42f6-8757-c55452affe65%2Ftiles.png?1551608607854');
    this.load.tilemapTiled('tilemap', 'tilemap.json');
  },

  create() {
    const tilemap = this.make.tilemap({key: 'tilemap'});
    // tilesetImage here is referring to the manually-loaded tileset image above
    const tileset = tilemap.addTilesetImage('tiles', 'tilesetImage');
    tilemap.createStaticLayer('layer1', tileset, 0, 0);
  },
};
```

Similarly, external tilesets should probably be a new type of thing that you could load in the `preload` step and associate with one (or many) tilemaps.

I tried to figure out how to write a patch like this to fix Phaser directly, but there are multiple types of tilemaps and tilesets supported in Phaser, and I don't really understand the internals well enough yet.

### So how does the loader work?

So if Phaser only supports internal tilesets, and doesn't parse the tilemap until the `create` step, what if we loaded and inserted the external tilesets _into_ our tilemaps before Phaser tried parsing them? Some people on the Phaser Discord recommend I write a preprocessor to do this (as they had been doing for a while), but I wanted to build something a bit more broadly reusable.

I spent a few hours reading the code for how loaders work in Phaser and found out that there are things called [MultiFile loaders](https://github.com/photonstorm/phaser/blob/c85648e06a7bf1de830acb5162dd6705f98ae947/src/loader/MultiFile.js) that support loading dependent files based on the contents of a manifest-like file. Using the [MutliAtlasFile loader](https://github.com/photonstorm/phaser/blob/c85648e06a7bf1de830acb5162dd6705f98ae947/src/loader/filetypes/MultiAtlasFile.js) as a based, I wrote a new loader that:

1. Loads the tilemap JSON
2. Finds all tilesets that have a `source` property
3. Processes each `source` property as relative to the tilemap's URL to get the URL for each tileset
4. Loads each external tileset
5. Inserts each loaded tileset back into the tilemap JSON
6. Adds the modified tilemap JSON into the tilemap cache

I tested with my own game and it seemed to work fine. The remaining steps were to add a webpage-ready bundle for projects that aren't using NPM or a JavaScript bundler, write instructions, and publish the package on NPM.

### Caveats

There's still some caveats to this method of loading external tilesets:

- Tilesets are duplicated between tilemaps in memory. Sharing references to tilesets would require some more complex coordination in the loader, or a more detailed refactor of how Phaser handles tilesets.

- I don't actually know if Phaser will avoid re-requesting a tileset if it is referenced by more than one tilemap. Presumably the browser will cache the request, at least.

- The loader is limited to JSON tilemaps and tilesets. TMX formatted tilesets are not supported.

But it works for me and I did it for free so whooooooooooo caressssssss

[^1]: I mean I actually could just ask the maintainer if I really wanted to.
