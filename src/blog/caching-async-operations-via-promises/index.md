---
template: blog-post
title: Caching Async Operations via Promises
date: 2016-08-22 09:00:00 -0700
author: Michael Kelly
twitter_handle: Osmose
tags:
  - mozilla
---
I was working on [a bug in Normandy][bug] the other day and remembered a fun little trick for caching asynchronous operations in JavaScript.

The bug in question involved two asynchronous actions happening within a function. First, we made an AJAX request to the server to get an "Action" object. Next, we took an attribute of the action, the `implementation_url`, and injected a `<script>` tag into the page with the `src` attribute set to the URL. The JavaScript being injected would then call a global function and pass it a class function, which was the value we wanted to return.

The bug was that if we called the function multiple times with the same action, the function would make multiple requests to the same URL, even though we really only needed to download data for each Action once. The solution was to cache the responses, but instead of caching the responses directly, I found it was cleaner to cache the [Promise][] returned when making the request instead:

```js
export function fetchAction(recipe) {
  const cache = fetchAction._cache;

  if (!(recipe.action in cache)) {
    cache[recipe.action] = fetch(`/api/v1/action/${recipe.action}/`)
      .then(response => response.json());
  }

  return cache[recipe.action];
}
fetchAction._cache = {};
```

Another neat trick in the code above is storing the cache as a property on the function itself; it helps avoid polluting the namespace of the module, and also allows callers to clear the cache if they wish to force a re-fetch (although if you actually needed that, it'd be better to add a parameter to the function instead).

After I got this working, I puzzled for a bit on how to achieve something similar for the `<script>` tag injection. Unlike an AJAX request, the only thing I had to work with was an `onload` handler for the tag. Eventually I realized that nothing was stopping me from wrapping the `<script>` tag injection in a Promise and caching it in exactly the same way:

```js
export function loadActionImplementation(action) {
  const cache = loadActionImplementation._cache;

  if (!(action.name in cache)) {
    cache[action.name] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = action.implementation_url;
      script.onload = () => {
        if (!(action.name in registeredActions)) {
          reject(new Error(`Could not find action with name ${action.name}.`));
        } else {
          resolve(registeredActions[action.name]);
        }
      };
      document.head.appendChild(script);
    });
  }

  return cache[action.name];
}
loadActionImplementation._cache = {};
```

From a nitpicking standpoint, I'm not entirely happy with this function:

- The name isn't really consistent with the "fetch" terminology from the previous function, but I'm not convinced they should use the same verb either.
- The Promise code could probably live in another function, leaving this one to only concern itself about the caching.
- I'm pretty sure this does nothing to handle the case of the script failing to load, like a 404.

But these are minor, and the patch got merged, so I guess it's good enough.

[bug]: https://bugzilla.mozilla.org/show_bug.cgi?id=1293475
[Promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
