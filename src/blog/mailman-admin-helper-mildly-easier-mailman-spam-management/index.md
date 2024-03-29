---
template: blog-post
title: "mailman-admin-helper: Mildly Easier Mailman Spam Management"
date: 2017-04-30 06:34:00 -0700
tags:
  - mozilla
---
Mozilla hosts a few [Mailman][] instances[^1], and I run a few mailing lists on them. Our interface for managing incoming spam is... okay.

[<img alt="Mailman default admindb interface" src="/blog/mailman-admin-helper-mildly-easier-mailman-spam-management/mailman_before.png">](/blog/mailman-admin-helper-mildly-easier-mailman-spam-management/mailman_before.png)

The form inputs are _tiny_. And it takes, like, 3 clicks to discard and blacklist spam per-sender. And, because I only learned about the options for filtering by spam headers within the past month, I had to use this interface on a daily basis for years.

Finally, about a year or so ago, I got fed up and wrote a bookmarklet that auto-clicked every form element needed to discard and blacklist every email on the page. Since it's rare for the lists I moderate to get legitimate emails that are marked for moderation, I didn't need anything more complex.

However, we recently updated our Mailman pages to use [CSP][], specifically the `script-src none` directive. Because the pages no longer accept _any_ URL as valid for script execution, my bookmarklet stopped working. I searched online for workarounds and didn't find anything informative[^2].

Luckily, I happen to have experience making [WebExtensions][] that inject [content scripts][] into web pages. It's as simple as creating a `manifest.json` file:

```json
{
  "manifest_version": 2,
  "name": "mailman-admin-helper",
  "version": "0.1.1",
  "applications": {
    "gecko": {
      "id": "mailman-admin-helper@mkelly.me"
    }
  },

  "description": "Adds useful shortcuts to Mozilla Mailman admin.",

  "content_scripts": [
    {
      "matches": [
        "*://mail.mozilla.org/admindb/*",
        "*://lists.mozilla.org/admindb/*"
      ],
      "js": ["index.js"],
      "css": ["index.css"]
    }
  ]
}
```

The `content_scripts` key is where the magic happens. List some domains, write some JavaScript and CSS, and you're done! The [web-ext][] tool makes testing, building, and signing the extension pretty painless.

An hour or two later, and I had finished my new WebExtension, [mailman-admin-helper][]. After it is installed, the admin interface is greatly simplified:

[<img alt="Mailman admindb interface as modified by the mailman-admin-helper extension" src="/blog/mailman-admin-helper-mildly-easier-mailman-spam-management/mailman_after.png">](/blog/mailman-admin-helper-mildly-easier-mailman-spam-management/mailman_after.png)

The block of checkboxes and radio buttons has been replaced by 4 buttons that immediately make their changes and refresh the page when clicked. And if you need to inspect and modify an individual email, you can still click through the email subject to get to the normal moderation page.

Granted, it cuts out a lot of functionality, but this extension is mostly meant for myself to use. Pull requests are welcome, though, in case anyone wants to add functionality that they commonly use.

Big thanks to the Add-ons team and community for making WebExtensions super-easy to use!

[^1]: I'm not entirely sure why we have two, but it's cool.
[^2]: I did find [bug 866522][], which discusses the reason bookmarklets don't work with CSP, as well as some proposed fixes to Firefox and the (in my opinion, correct) wisdom that bookmarklets are a dead-end anyway.

[Mailman]: http://www.list.org/
[CSP]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
[bug 866522]: https://bugzilla.mozilla.org/show_bug.cgi?id=866522
[WebExtensions]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
[content scripts]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts
[web-ext]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext
[mailman-admin-helper]: https://github.com/Osmose/mailman-admin-helper

