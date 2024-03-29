---
template: blog-post
title: Build and Sign WebExtensions with CircleCI
date: 2017-05-04 01:10:00 -0700
tags:
  - mozilla
---
Once [Planet Mozilla][] updated with my [last post][], I got a few bug reports and feature requests for [mailman-admin-helper][], along with a pull request (Thanks, [TheOne][]!). Clearly I'm not the only person who isn't a fan of our mailing list admin.

Before landing anything, I decided to see if I could get automatic builds running so that I wouldn't have to pull a build pull requests myself when I want to test them. What I ended up with, however, does a bit more than that; it also runs lints, and even signs and uploads new releases when I push a new tag.

We use [CircleCI][] on [Normandy][], so I defaulted to using them for this as well. I'll walk through the sections, but here's the entire `circle.yml` file I ended up with:

```yaml
machine:
  node:
    version: 7.10.0
dependencies:
  override:
    - sudo apt-get update; sudo apt-get install jq
    - go get -u github.com/tcnksm/ghr
    - npm install -g web-ext
compile:
  override:
    - web-ext build
    - mv web-ext-artifacts $CIRCLE_ARTIFACTS
test:
  override:
    - web-ext lint --self-hosted
deployment:
  release:
    tag: /v[0-9]+(\.[0-9]+)*/
    owner: Osmose
    commands:
      - jq --arg tag "${CIRCLE_TAG:1}" '.version = $tag' manifest.json > tmp.json && mv tmp.json manifest.json
      - web-ext sign --api-key $AMO_API_KEY --api-secret $AMO_API_SECRET
      - ghr -u Osmose $CIRCLE_TAG web-ext-artifacts
```

If you want to adapt this to your own project, you'll want to change the `deployment.release.owner` field to the Github account hosting your WebExtension, and add the following environment variables to your CircleCI project config (__NOT__ your `circle.yml` file, which is committed to your repo):

- `GITHUB_TOKEN`: A [personal access token][] with either the `public_repo` or `repo` permissions, depending on whether your repository is public or private.

- `AMO_API_KEY`: The JWT issuer field from your [addons.mozilla.org API Credentials][].

- `AMO_API_SECRET`: The JWT secret field from your addons.mozilla.org API Credentials.

[Planet Mozilla]: https://planet.mozilla.org/
[last post]: /blog/mailman-admin-helper-mildly-easier-mailman-spam-management/
[mailman-admin-helper]: https://github.com/Osmose/mailman-admin-helper
[TheOne]: https://github.com/wagnerand
[CircleCI]: https://github.com/mozilla/normandy
[Normandy]: https://github.com/mozilla/normandy
[personal access token]: https://github.com/settings/tokens
[addons.mozilla.org API Credentials]: https://addons.mozilla.org/en-US/developers/addon/api/key/

### How does it work?

[circle.yml][] files are split into phases. Each phase has a default action that is overridden with the `override` key.

```yaml
machine:
  node:
    version: 7.10.0
```

The `machine` phase defines the machine used to run your build. Here we're just making sure that we have a recent version of Node.

```yaml
dependencies:
  override:
    - sudo apt-get update; sudo apt-get install jq
    - go get -u github.com/tcnksm/ghr
    - npm install -g web-ext
```

The `dependencies` step is for installing libraries and programs that your build needs. Our build process has three dependencies:

- [jq][]: A command-line JSON processor that we use to replace the version number in `manifest.json`.

- [ghr][]: A tool for uploading artifacts to Github release pages. Our build image already has a recent version of Go installed, so we install this via [go get][].

- [web-ext][]: Mozilla's command-line tool for building and testing WebExtensions.

```yaml
compile:
  override:
    - web-ext build
    - mv web-ext-artifacts $CIRCLE_ARTIFACTS
```

The `compile` step is used to build your project before testing. While we aren't running any tests that need a built add-on, this is a good time to build the add-on and upload it to the `$CIRCLE_ARTIFACTS` directory, which is saved and made available for download once the build is complete. This makes it easy to pull a ready-to-test build of the add-on from open pull requests.

```yaml
test:
  override:
    - web-ext lint --self-hosted
```

The `test` step is for actually running your tests. We don't have automated tests for mailman-admin-helper, but web-ext comes with a handy lint command to help catch common errors.

One thing to note about CircleCI is that any commands that return non-zero return codes will stop the build immediately and mark it as failed, _except_ for commands in the `test` step. `test` step commands will mark a build as failed, but will not stop other commands in the `test` step from running. This is useful for running multiple types of tests or lints because it allows you to see all of your failures instead of exiting early before running all of your tests.

```yaml
deployment:
  release:
    tag: /v[0-9]+(\.[0-9]+)*/
    owner: Osmose
    commands:
      - jq --arg tag "${CIRCLE_TAG:1}" '.version = $tag' manifest.json > tmp.json && mv tmp.json manifest.json
      - web-ext sign --api-key $AMO_API_KEY --api-secret $AMO_API_SECRET
      - ghr -u Osmose $CIRCLE_TAG web-ext-artifacts
```

The `deployment` section only runs on successful builds, and handles deploying your code. It's made up of multiple named sections, and each section must either have a `branch` or `tag` field describing the branches or tags that the section will run for.

In our case, we're using a regex that matches tags named like version numbers prefixed with `v`, e.g. `v0.1.2`. We also set the `owner` to my Github account so that forks will not run the deployment process.

The commands do three things:

1. Use `jq` to modify the `version` key in `manifest.json` to match the version number from the tag. The `v` prefix is removed before the replacement.

2. Use `web-ext` to build and sign the WebExtension, using API keys stored in environment variables. This creates an XPI file in the `web-ext-artifacts` directory.

3. Use `ghr` to upload the contents of `web-ext-artifacts` (which should just by the signed XPI) to the tag on Github. This uses the `GITHUB_TOKEN` environment variable for authentication.

The end result is that, whenever a new tag is pushed to the repository, CircleCI adds a signed XPI to the release page on Github automatically, without any human intervention. Convenient!

[circle.yml]: https://circleci.com/docs/1.0/configuration/
[jq]: https://stedolan.github.io/jq/
[ghr]: https://github.com/tcnksm/ghr
[web-ext]: https://github.com/mozilla/web-ext

----

Feel free to steal this for your own WebExtension, or share any comments or suggestions either in the comments or directly on the mailman-admin-helper repository. Thanks for reading!
