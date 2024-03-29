---
template: blog-post
title: Q is Scary
date: 2017-06-08 12:41:00 -0700
tags:
  - mozilla
---
[q][] is the hands-down winner of my "Libraries I'm Terrified Of" award. It's a Python library for outputting debugging information while running a program.

On the surface, everything seems fine. It logs everything to `/tmp/q` (configurable), which you can watch with `tail -f`. The basic form of q is passing it a variable:

```python
import q

foo = 7
q(foo)
```

Take a good long look at that code sample, and then answer me this: What is the type of q?

If you said "callable module", you are right. Also, that is not a thing that exists in Python.

Also, check out the output in `/tmp/q`:

```
0.0s <module>: foo=7
```

_It knows the variable name._ It also knows that it's being called at the module level; if we were in a function, `<module>` would be replaced with the name of the function.

You can also divide (`/`) or bitwise OR (`|`) values with q to log them as well. And you can decorate a function with it to trace the arguments and return value. It also has a method, `q.d()`, that starts an interactive session.

And it does all this in under 400 lines, the majority of which is either a docstring or code to format the output.

<figure>
    <img alt="Spooky" src="/blog/q-is-scary/napstablook.gif">
    <figcaption>Spooky.</figcaption>
</figure>

[q]: https://github.com/zestyping/q

## How in the Hell

So first, let's get this callable module stuff out of the way. Here's the last two lines in `q.py`:

```python
# Install the Q() object in sys.modules so that "import q" gives a callable q.
sys.modules['q'] = Q()
```

Turns out `sys.modules` is a dictionary with all the loaded modules, and you can just stuff it with whatever nonsense you like.

The `Q` class itself is super-fun. Check out the declaration:

```python
# When we insert Q() into sys.modules, all the globals become None, so we
# have to keep everything we use inside the Q class.
class Q(object):
    __doc__ = __doc__  # from the module's __doc__ above

    import ast
    import code
    import inspect
    import os
    import pydoc
    import sys
    import random
    import re
    import time
    import functools
```

__"When we insert Q() into sys.modules, all the globals become None"__

What? Why?! I mean I can see how that's not an issue for modules, which are usually the only things inside `sys.modules`, but still. I tried chasing this down, but the entire `sys` module is [written in C][sysmodule.c], and that ain't my business.

Most of the other bits inside `Q` are straightforward by comparison; a few helpers for outputting stuff cleanly, overrides for `__truediv__` and `__or__` for those weird operator versions of logging, etc. If you've never heard of callable types[^1] before, that's the reason why an instance of this class can be both called as a function and treated as a value.

So what's `__call__` do?

[sysmodule.c]: https://github.com/python/cpython/blob/48fb766f70d9ca9d5934cbddbe8d8e7972cb6343/Python/sysmodule.c
[^1]: [Check out this page](https://docs.python.org/3/reference/datamodel.html) and search for "Callable Types" and/or `__call__`.

## Ghost Magic

```python
def __call__(self, *args):
    """If invoked as a decorator on a function, adds tracing output to the
    function; otherwise immediately prints out the arguments."""
    info = self.inspect.getframeinfo(self.sys._getframe(1), context=9)

    # ... snip ...
```

Welcome to the [inspect module][]. Turns out, Python has a built-in module that lets you get all sorts of fun info about objects, classes, etc. It also lets you get info about __stack frames__, which store the state of each subroutine in the chain of subroutine calls that led to running the code that's currently executing.

Here, q is using a CPython-specific function `sys._getframe` to get a frame object for the code that called q, and then using inspect to get info about that code.

```python
# info.index is the index of the line containing the end of the call
# expression, so this gets a few lines up to the end of the expression.
lines = ['']
if info.code_context:
    lines = info.code_context[:info.index + 1]

# If we see "@q" on a single line, behave like a trace decorator.
for line in lines:
    if line.strip() in ('@q', '@q()') and args:
        return self.trace(args[0])
```

...and then it just does a text search of the source code to figure out if it was called as a function or as a decorator. Because it can't just guess by the type of the argument being passed (you might want to log a function object), and it can't just return a callable that can be used as a decorator either.

`trace` is pretty normal, whatever that means. It just logs the intercepted arguments and return value / raised exception.

```python
# Otherwise, search for the beginning of the call expression; once it
# parses, use the expressions in the call to label the debugging
# output.
for i in range(1, len(lines) + 1):
    labels = self.get_call_exprs(''.join(lines[-i:]).replace('\n', ''))
    if labels:
        break
self.show(info.function, args, labels)
return args and args[0]
```

The last bit pulls out labels from the source code; this is how q knows the name of the variable that you pass in. I'm not going to go line-by-line through `get_call_exprs`, but it uses the [ast][] module to parse the function call into an Abstract Syntax Tree, and walks through that to find the variable names.

[inspect module]: https://docs.python.org/3/library/inspect.html
[ast]: https://docs.python.org/3/library/ast.html

----

It goes without saying that you should never do any of this. Ever. Nothing is sacred when it comes to debugging, though, and q is incredibly useful when you're having trouble getting your program to print anything out sanely.

Also, if you're ever bored on a nice summer evening, check out the [list of modules in the Python standard library][stdlib]. It's got _everything_:

- [Tracing memory allocations](https://docs.python.org/3/library/tracemalloc.html)
- [Controlling the garbage collector](https://docs.python.org/3/library/gc.html)
- [Linting python files for ambiguous indentation](https://docs.python.org/3/library/tabnanny.html)
- [Computing diffs](https://docs.python.org/3/library/difflib.html)
- [Weakrefs](https://docs.python.org/3/library/weakref.html)
- [Running code when your program exits](https://docs.python.org/3/library/atexit.html)
- [Manipulating wave audio files](https://docs.python.org/3/library/wave.html)

[stdlib]: https://docs.python.org/3/library/index.html
