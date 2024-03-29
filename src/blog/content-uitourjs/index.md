---
template: blog-post
title: content-UITour.js
date: 2017-4-25 08:57:00 -0700
twitter_handle: Osmose
tags:
  - mozilla
---
Recently I found myself trying to comprehend an unfamiliar piece of code. In this case, it was [`content-UITour.js`][content-uitour], a file that handles the interaction between unprivileged webpages and [`UITour.jsm`][uitourjsm].

[UITour][] allows webpages to highlight buttons in the toolbar, open menu panels, and perform other tasks involved in giving Firefox users a tour of the user interface. The event-based API allows us to iterate quickly on the onboarding experience for Firefox by controlling it via easily-updated webpages. Only a small set of Mozilla-owned domains are allowed access to the UITour API.

[content-uitour]: https://dxr.mozilla.org/mozilla-central/source/browser/components/uitour/content-UITour.js
[uitourjsm]: https://dxr.mozilla.org/mozilla-central/source/browser/components/uitour/UITour.jsm
[UITour]: http://bedrock.readthedocs.io/en/latest/uitour.html

### Top-level View

My first step when trying to grok unfamiliar JavaScript is to check out everything at the top-level of the file. If we take `content-UITour.js` and remove some comments, imports, and constants, we get:

```js
var UITourListener = {
  handleEvent(event) {
    /* ... */
  },

  /* ... */
};

addEventListener("mozUITour", UITourListener, false, true);
```

Webpages that want to use UITour emit [synthetic events][] with the name `"mozUITour"`. In the snippet above, `UITourListener` is the object that receives these events. Normally, event listeners are functions, but they can also be [EventListeners][], which are simply objects with a `handleEvent` function.

According to [Mossop's comment][gh-comment], `content-UITour.js` is [loaded in `browser.js`][browserjs]. A search for `firefox loadFrameScript` brings up two useful pages:

- [nsIFrameScriptLoader][], which describes how `loadFrameScript` takes our JavaScript file and loads it into a remote frame. If you don't innately know what a remote frame is, then you should read...

- [Message manager overview][], which gives a great overview of frame scripts and how they relate to multi-process Firefox. In particular, `browser.js` seems to be asking for a [browser message manager][].

It looks like `content-UITour.js` is loaded for each tab with a webpage open, but it can do some more privileged stuff than a normal webpage. Also, the global object seems to be `window`, referring to the browser window containing the webpage, since events from the webpage are bubbling up to it. Neat!

[EventListeners]: https://developer.mozilla.org/en-US/docs/Web/API/EventListener
[browserjs]: https://dxr.mozilla.org/mozilla-central/source/browser/base/content/browser.js#1159
[nsIFrameScriptLoader]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFrameScriptLoader
[Message manager overview]: https://developer.mozilla.org/en-US/Firefox/Multiprocess_Firefox/Message_Manager/Message_manager_overview
[browser message manager]: https://developer.mozilla.org/en-US/Firefox/Multiprocess_Firefox/Message_Manager/Message_manager_overview#Browser_message_manager
[gh-comment]: https://github.com/mozilla/normandy/issues/416#issuecomment-294193031
[synthetic events]: https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events

### Events from Webpages

So what about `handleEvent`?

```js
handleEvent(event) {
  if (!Services.prefs.getBoolPref("browser.uitour.enabled")) {
    return;
  }
  if (!this.ensureTrustedOrigin()) {
    return;
  }
  addMessageListener("UITour:SendPageCallback", this);
  addMessageListener("UITour:SendPageNotification", this);
  sendAsyncMessage("UITour:onPageEvent", {
    detail: event.detail,
    type: event.type,
    pageVisibilityState: content.document.visibilityState,
  });
},
```

If UITour itself is disabled, or if the origin of the webpage we're registered on isn't trustworthy, events are thrown away. Otherwise, we register `UITourListener` as a message listener, and send a message of our own.

I remember seeing `addMessageListener` and `sendAsyncMessage` on the browser message manager documentation; they look like a fairly standard event system. But where are these events coming from, and where are they going to?

In lieu of any better leads, our best bet is to search DXR for `"UITour:onPageEvent"`, which leads to [`nsBrowserGlue.js`][nsbrowserglue]. Luckily for us, I've actually heard of this file before: it's a grab-bag for things that need to happen to set up Firefox that don't fit anywhere else. For our purposes, it's enough to know that stuff in here gets run once when the browser starts.

The lines in question:

```js
// Listen for UITour messages.
// Do it here instead of the UITour module itself so that the UITour module is lazy loaded
// when the first message is received.
var globalMM = Cc["@mozilla.org/globalmessagemanager;1"].getService(Ci.nsIMessageListenerManager);
globalMM.addMessageListener("UITour:onPageEvent", function(aMessage) {
  UITour.onPageEvent(aMessage, aMessage.data);
});
```

Oh, I remember reading about the [global message manager][]! It covers _every_ frame. This seems to be where all the events coming up from individual frames get gathered and passed to UITour. That `UITour` variable is coming from a clever lazy-import block at the top:

```js
[
/* ... */
["UITour", "resource:///modules/UITour.jsm"],
/* ... */
].forEach(([name, resource]) => XPCOMUtils.defineLazyModuleGetter(this, name, resource));
```

In other words, `UITour` refers to the module in `UITour.jsm`, but it isn't loaded until we receive our first event, which helps make Firefox startup snappier.

For our purposes, we're not terribly interested in what UITour does with these messages, as long as we know how they're getting there. We are, however, interested in the messages that we're listening for: `"UITour:SendPageCallback"` and `"UITour:SendPageNotification"`. Another DXR search tells me that those are in [`UITour.jsm`][sendpagecallback]. A skim of the results shows that these messages are used for things like notifying the webpage when an operation is finished, or returning information that was requested by the webpage.

----

To summarize:

- `handleEvent` in the content process triggers behavior from `UITour.jsm` in the chrome process by sending and receiving messages sent through the message manager system.

- `handleEvent` checks that the origin of a webpage is trustworthy before doing anything.

- The UITour module in the chrome process is not initialized until a webpage emits an event for it.

The rest of the `content-UITour.js` is split between origin verification and sending events back down to the webpage.

[nsbrowserglue]: https://dxr.mozilla.org/mozilla-central/source/browser/components/nsBrowserGlue.js#2655
[global message manager]: https://developer.mozilla.org/en-US/Firefox/Multiprocess_Firefox/Message_Manager/Message_manager_overview#Global_frame_message_manager
[sendpagecallback]: https://dxr.mozilla.org/mozilla-central/source/browser/components/uitour/UITour.jsm#897

### Verifying Webpage URLs

Next, let's take a look at `ensureTrustedOrigin`:

```js
ensureTrustedOrigin() {
  if (content.top != content)
    return false;

  let uri = content.document.documentURIObject;

  if (uri.schemeIs("chrome"))
    return true;

  if (!this.isSafeScheme(uri))
    return false;

  let permission = Services.perms.testPermission(uri, UITOUR_PERMISSION);
  if (permission == Services.perms.ALLOW_ACTION)
    return true;

  return this.isTestingOrigin(uri);
},
```

MDN tells us that [`content`][content] is the Window object for the primary content window; in other words, the webpage. [`top`][top], on the other hand, is the topmost window in the window hierarchy (relevant for webpages that get loaded in iframes). Thus, the first check is to make sure we're not in some sort of frame. Without this, a webpage could control when UITour executes things by loading a whitelisted origin in an iframe[^1].

[documentURIObject][] lets us check the origin of the loaded webpage. `chrome://` URIs get passed immediately, since they're already privileged. The next three checks are more interesting:

[content]: https://developer.mozilla.org/en-US/docs/Web/API/Window/content
[top]: https://developer.mozilla.org/en-US/docs/Web/API/Window/top
[documentURIObject]: https://developer.mozilla.org/en-US/docs/Web/API/Window/top
[^1]: While this isn't a security issue on its own, it gives some level of control to an attacker, which generally should be avoided where possible.

#### isSafeScheme

```js
isSafeScheme(aURI) {
  let allowedSchemes = new Set(["https", "about"]);
  if (!Services.prefs.getBoolPref("browser.uitour.requireSecure"))
    allowedSchemes.add("http");

  if (!allowedSchemes.has(aURI.scheme))
    return false;

  return true;
},
```

This function checks the URI scheme to see if it's considered "safe" enough to use UITour functions. By default, `https://` and `about:` pages are allowed. `http://` pages are also allowed if the `browser.uitour.requireSecure` preference is false (it defaults to true).

#### Permissions

The next check is against the permissions system. The [`Services.jsm`][services] documentation says that `Services.perms` refers to an instance of the [nsIPermissionManager][] interface. The check itself is easy to understand, but what's missing is how these permissions get added in the first place. A fresh Firefox profile has some sites already whitelisted for UITour, but where does that whitelist come from?

This is where DXR really shines. If we look at [nsIPermissionManager.idl][] and click the name of the interface, a dropdown appears with several options. The "Find subclasses" option performs a search for `"derived:nsIPermissionManager"`, which leads to the [header file for nsPermissionManager][nsPermissionManager.h].

We're looking for where the default permission values come from, so an in-page search for the word `"default"` eventually lands on a function named `ImportDefaults`. Clicking that name and selecting "Jump to definition" lands us inside [nsPermissionManager.cpp][], and the very first line of the function is:

```cpp
nsCString defaultsURL = mozilla::Preferences::GetCString(kDefaultsUrlPrefName);
```

An in-page search for `kDefaultsUrlPrefName` leads to:

```cpp
// Default permissions are read from a URL - this is the preference we read
// to find that URL. If not set, don't use any default permissions.
static const char kDefaultsUrlPrefName[] = "permissions.manager.defaultsUrl";
```

On my Firefox profile, the `"permissions.manager.defaultsUrl"` preference is set to [resource://app/defaults/permissions][apppermissions]:

```text
# This file has default permissions for the permission manager.
# The file-format is strict:
# * matchtype \t type \t permission \t host
# * "origin" should be used for matchtype, "host" is supported for legacy reasons
# * type is a string that identifies the type of permission (e.g. "cookie")
# * permission is an integer between 1 and 15
# See nsPermissionManager.cpp for more...

# UITour
origin	uitour	1	https://www.mozilla.org
origin	uitour	1	https://self-repair.mozilla.org
origin	uitour	1	https://support.mozilla.org
origin	uitour	1	https://addons.mozilla.org
origin	uitour	1	https://discovery.addons.mozilla.org
origin	uitour	1	about:home

# ...
```

Found it! A quick DXR search reveals that this file is in [/browser/app/permissions][dxr-perms] in the tree. I'm not entirely sure where that `defaults` bit in the URL is coming from, but whatever.

With this, we can confirm that the permissions check is where most valid uses of UITour are passed, and that this permissions file is where the whitelist of allowed domains lives.

[services]: https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Services.jsm
[nsIPermissionManager]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIPermissionManager
[nsIPermissionManager.idl]: https://dxr.mozilla.org/mozilla-central/source/netwerk/base/nsIPermissionManager.idl
[nsPermissionManager.h]: https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.h#32
[nsPermissionManager.cpp]: https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp?q=%2Bfunction%3AnsPermissionManager%3A%3AImportDefaults%28%29&redirect_type=single#2679
[apppermissions]: resource://app/defaults/permissions
[dxr-perms]: https://dxr.mozilla.org/mozilla-central/source/browser/app/permissions

#### isTestingOrigin

The last check in `ensureTrustedOrigin` falls back to `isTestingOrigin`:

```js
isTestingOrigin(aURI) {
  if (Services.prefs.getPrefType(PREF_TEST_WHITELIST) != Services.prefs.PREF_STRING) {
    return false;
  }

  // Add any testing origins (comma-seperated) to the whitelist for the session.
  for (let origin of Services.prefs.getCharPref(PREF_TEST_WHITELIST).split(",")) {
    try {
      let testingURI = Services.io.newURI(origin);
      if (aURI.prePath == testingURI.prePath) {
        return true;
      }
    } catch (ex) {
      Cu.reportError(ex);
    }
  }
  return false;
},
```

Remember those boring constants we ignored earlier? Here's one of them in action! Specifically, it's `PREF_TEST_WHITELIST`, which is set to `"browser.uitour.testingOrigins"`.

This function appears to parse the preference as a comma-separated list of URIs. It fails early if the preference isn't a string, then splits the string and loops over each entry, converting them to URI objects.

The [nsIURI][prepath] documentation notes that `prePath` is everything in the URI before the path, including the protocol, hostname, port, etc. Using `prePath`, the function iterates over each URI in the preference and checks it against the URI of the webpage. If it matches, then the page is considered safe!

(And if anything fails when parsing URIs, errors are reported to the console using [reportError][] and discarded.)

As the preference name implies, this is useful for developers who want to test a webpage that uses UITour without having to set up their local development environment to fake being one of the whitelisted origins.

[prepath]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIURI#Components_of_a_URI
[reportError]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Language_Bindings/Components.utils.reportError

### Sendings Messages Back to the Webpage

The other remaining logic in `content-UITour.js` handles messages sent back to the content process from `UITour.jsm`:

```js
receiveMessage(aMessage) {
  switch (aMessage.name) {
    case "UITour:SendPageCallback":
      this.sendPageEvent("Response", aMessage.data);
      break;
    case "UITour:SendPageNotification":
      this.sendPageEvent("Notification", aMessage.data);
      break;
    }
},
```

You may remember the [Message manager overview][], which links to documentation for several functions, including [addMessageListener][]. We passed in `UITourListener` as the listener, which the documentation says should implement the [nsIMessageListener][] interface. Thus, `UITourListener.receiveMessage` is called whenever messages are received from `UITour.jsm`.

The function itself is simple; it defers to `sendPageEvent` with slightly different parameters depending on the incoming message.

```js
sendPageEvent(type, detail) {
  if (!this.ensureTrustedOrigin()) {
    return;
  }

  let doc = content.document;
  let eventName = "mozUITour" + type;
  let event = new doc.defaultView.CustomEvent(eventName, {
    bubbles: true,
    detail: Cu.cloneInto(detail, doc.defaultView)
  });
  doc.dispatchEvent(event);
}
```

`sendPageEvent` starts off with another trusted origin check, to avoid sending results from UITour to untrusted webpages. Next, it creates a custom event to dispatch onto the document element of the webpage. Webpages register an event listener on the root document element to receive data returned from UITour.

[`defaultView`][defaultView] returns the window object for the document in question.

Describing [`cloneInto`][cloneInto] could take up an entire post on its own. In short, `cloneInto` is being used here to copy the object from UITour in the chrome process (a privileged context) for use in the webpage (an unprivileged context). Without this, the webpage would not be able to access the `detail` value at all.

[addMessageListener]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIMessageListenerManager#addMessageListener()
[nsIMessageListener]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIMessageListener
[defaultView]: https://developer.mozilla.org/en-US/docs/Web/API/Document/defaultView
[cloneInto]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Language_Bindings/Components.utils.cloneInto

### And That's It!

It takes effort, but I've found that deep-dives like this are a great way to both understand a single piece of code, and to learn from the style of the code's author(s). Hopefully ya'll will find this useful as well!
