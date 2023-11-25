---
template: blog-post
title: "Phaser Tutorial Series: Finite State Machine"
date: 2019-02-23 01:10:00 -0700
tags:
  - mozilla
  - phaser
  - gamedev
---
I've been working on a game using [Phaser][] in my spare time.

One thing that's made adding new features really easy is using finite-state machines to model behavior. Almost everything in the animation above is backed by a state machine: the player, the platform, the grappling hook, the statue, and the fireballs.

This post is going to assume some familiarity with the basics of Phaser, such as the `preload`/`create`/`update` steps, Arcade physics, and keyboard input. You may also be able to follow along if you're not familiar with Phaser, but it's okay if not! This use of state machines isn't specific to Phaser.

### <strike>What is a finite-state machine?</strike> Fuck that let's make games

Let's start with a fairly empty example project. Here it is on [Glitch][]. You can use the remix button to create your own copy and follow along the tutorial as we go:

<div class="glitch-embed-wrap">
  <iframe
    allow="geolocation; microphone; camera; midi; encrypted-media"
    src="https://glitch.com/embed/#!/embed/phaser-fsm-example-starter?path=public/client.js&previewSize=40"
    alt="phaser-fsm-example-starter on Glitch"
    style="height: 100%; width: 100%; border: 0;">
  </iframe>
</div>

Pretty much all of our work is happening in `client.js`. It starts out looking something like this:

```js
/* global Phaser */

const config = {
  type: Phaser.AUTO,
  width: 400,
  height: 300,
  pixelArt: true,
  zoom: 2,
  physics: {
    default: 'arcade'
  },
  scene: {
    preload() {
      this.load.spritesheet('hero', 'https://cdn.glitch.com/59aa1c5f-c16d-41a1-bfd2-09072e84a538%2Fhero.png?1551136698770', {
        frameWidth: 32,
        frameHeight: 32,
      });
      this.load.image('bg', 'https://cdn.glitch.com/59aa1c5f-c16d-41a1-bfd2-09072e84a538%2Fbg.png?1551136995353');
    },

    create() {
      // Static background
      this.add.image(200, 200, 'bg');

      // The movable character
      this.hero = this.physics.add.sprite(200, 150, 'hero', 0);
    },

    update() {

    },
  }
};

window.game = new Phaser.Game(config);
```

We're loading some images in the `preload` step, and adding the background and hero sprite in the `create` step. The hero is drawn on the background, but nothing else happens.

### MAKE IT WALK

Let's add a `this.keys` variable for reading input from the keyboard. We can use that in the `update` method to check which keys are being pressed and set the hero's velocity appropriately:

```diff
@@ -19,6 +19,8 @@
     },

     create() {
+      this.keys = this.input.keyboard.createCursorKeys();
+
       // Static background
       this.add.image(200, 200, 'bg');

@@ -27,7 +29,20 @@
     },

     update() {
-
+      // Stop movement from last update
+      this.hero.setVelocity(0);
+
+      // Set new velocity based on input
+      if (this.keys.up.isDown) {
+        this.hero.setVelocityY(-100);
+      } else if (this.keys.down.isDown) {
+        this.hero.setVelocityY(100);
+      }
+      if (this.keys.left.isDown) {
+        this.hero.setVelocityX(-100);
+      } else if (this.keys.right.isDown) {
+        this.hero.setVelocityX(100);
+      }
     },
   }
 };
```

### MAKE IT LOOK LIKE IT'S WALKING

Now the hero is moving about the map, but it doesn't look like he's walking. To do that, we'll need to do two things:

1. Define some animations from our sprite sheet in the `create` function. Our sheet is split into 32x32 pixel squares, so we can use `generateFrameNumbers` to generate animation data by giving it start and end indexes for the animation frames. These are numbered from top left to bottom right.
2. Trigger the proper animations in the `update` function. We also track whether the player is moving or not, and if they aren't, we stop the current animation to stop the player from walking. Note the `true` passed to the `play` function: this tells Phaser to not restart the animation if it's already playing.

```diff
@@ -26,22 +26,61 @@

       // The movable character
       this.hero = this.physics.add.sprite(200, 150, 'hero', 0);
+
+      // Animation definitions
+      this.anims.create({
+        key: 'walk-down',
+        frameRate: 8,
+        repeat: -1,
+        frames: this.anims.generateFrameNumbers('hero', {start: 0, end: 3}),
+      });
+      this.anims.create({
+        key: 'walk-right',
+        frameRate: 8,
+        repeat: -1,
+        frames: this.anims.generateFrameNumbers('hero', {start: 4, end: 7}),
+      });
+      this.anims.create({
+        key: 'walk-up',
+        frameRate: 8,
+        repeat: -1,
+        frames: this.anims.generateFrameNumbers('hero', {start: 8, end: 11}),
+      });
+      this.anims.create({
+        key: 'walk-left',
+        frameRate: 8,
+        repeat: -1,
+        frames: this.anims.generateFrameNumbers('hero', {start: 12, end: 15}),
+      });
     },

     update() {
       // Stop movement from last update
+      let moving = false;
       this.hero.setVelocity(0);

       // Set new velocity based on input
       if (this.keys.up.isDown) {
         this.hero.setVelocityY(-100);
+        this.hero.anims.play('walk-up', true);
+        moving = true;
       } else if (this.keys.down.isDown) {
         this.hero.setVelocityY(100);
+        this.hero.anims.play('walk-down', true);
+        moving = true;
       }
       if (this.keys.left.isDown) {
         this.hero.setVelocityX(-100);
+        this.hero.anims.play('walk-left', true);
+        moving = true;
       } else if (this.keys.right.isDown) {
         this.hero.setVelocityX(100);
+        this.hero.anims.play('walk-right', true);
+        moving = true;
+      }
+
+      if (!moving) {
+        this.hero.anims.stop();
       }
     },
   }
```

### MAKE IT UNNECESSARILY VIOLENT

Next, let's make the player swing their sword when we press the space key. This actually involves a few steps:

1. Check if the space key is pressed.
2. Stop player movement while the sword is being swung.

   We'll need to know if the hero is currently swinging their sword, so we'll add a `swinging` variable on `this.hero` that determines if the swinging animation is still playing.
3. Determine which direction the player is facing.

   Figuring out the direction requires that we add a new variable called `direction` to keep track between walking and swinging. Storing this on the `this.hero` object makes it clear that the direction isn't for, say, an enemy we may add later.
4. Play the sword-swinging animation for the appropriate direction.
5. Once the animation is done playing, switch back to the non-sword-swinging sprites and allow movement again.

Doing all of this with the movement code is tricky, and difficult to split into single code changes. You may want to take a bit to look over the diff to understand the changes:

```diff
@@ -26,6 +26,8 @@

       // The movable character
       this.hero = this.physics.add.sprite(200, 150, 'hero', 0);
+      this.hero.direction = 'down';
+      this.hero.swinging = false;

       // Animation definitions
       this.anims.create({
@@ -52,6 +54,32 @@
         repeat: -1,
         frames: this.anims.generateFrameNumbers('hero', {start: 12, end: 15}),
       });
+
+      // NOTE: Sword animations do not repeat
+      this.anims.create({
+        key: 'swing-down',
+        frameRate: 8,
+        repeat: 0,
+        frames: this.anims.generateFrameNumbers('hero', {start: 16, end: 19}),
+      });
+      this.anims.create({
+        key: 'swing-up',
+        frameRate: 8,
+        repeat: 0,
+        frames: this.anims.generateFrameNumbers('hero', {start: 20, end: 23}),
+      });
+      this.anims.create({
+        key: 'swing-right',
+        frameRate: 8,
+        repeat: 0,
+        frames: this.anims.generateFrameNumbers('hero', {start: 24, end: 27}),
+      });
+      this.anims.create({
+        key: 'swing-left',
+        frameRate: 8,
+        repeat: 0,
+        frames: this.anims.generateFrameNumbers('hero', {start: 28, end: 31}),
+      });
     },

     update() {
@@ -59,28 +87,43 @@
       let moving = false;
       this.hero.setVelocity(0);

-      // Set new velocity based on input
-      if (this.keys.up.isDown) {
-        this.hero.setVelocityY(-100);
-        this.hero.anims.play('walk-up', true);
-        moving = true;
-      } else if (this.keys.down.isDown) {
-        this.hero.setVelocityY(100);
-        this.hero.anims.play('walk-down', true);
-        moving = true;
-      }
-      if (this.keys.left.isDown) {
-        this.hero.setVelocityX(-100);
-        this.hero.anims.play('walk-left', true);
-        moving = true;
-      } else if (this.keys.right.isDown) {
-        this.hero.setVelocityX(100);
-        this.hero.anims.play('walk-right', true);
-        moving = true;
-      }
-
-      if (!moving) {
-        this.hero.anims.stop();
+      // If we're swinging a sword, wait for the animation to finish
+      if (!this.hero.swinging) {
+        // Swinging a sword overrides movement
+        if (this.keys.space.isDown) {
+          this.hero.swinging = true;
+          this.hero.anims.play(`swing-${this.hero.direction}`, true);
+          this.hero.once('animationcomplete', () => {
+            this.hero.anims.play(`walk-${this.hero.direction}`, true);
+            this.hero.swinging = false;
+          });
+        } else {
+          // Set new velocity based on input
+          if (this.keys.up.isDown) {
+            this.hero.setVelocityY(-100);
+            this.hero.direction = 'up';
+            moving = true;
+          } else if (this.keys.down.isDown) {
+            this.hero.setVelocityY(100);
+            this.hero.direction = 'down';
+            moving = true;
+          }
+          if (this.keys.left.isDown) {
+            this.hero.setVelocityX(-100);
+            this.hero.direction = 'left';
+            moving = true;
+          } else if (this.keys.right.isDown) {
+            this.hero.setVelocityX(100);
+            this.hero.direction = 'right';
+            moving = true;
+          }
+
+          if (!moving) {
+            this.hero.anims.stop();
+          } else {
+            this.hero.anims.play(`walk-${this.hero.direction}`, true);
+          }
+        }
       }
     },
   }
```

### MAKE IT DO MORE?

Okay so the hero is now swinging their sword, next we want to add the ability for them to jump, or maybe we want to handle collision detection, or maybe add some enemy logic to the update loop, or... well, you get the idea. We've barely added some basic functionality to the game and already the update loop is getting difficult to manage.

The core problem here is that, to add some new feature to the player, like a new weapon or ability, we need to think about _every other thing the player can do_. What happens if the player uses a hookshot while moving? What if they use a jump power while moving? One may freeze the player in place while the other retains their momentum. There's too much state to keep in our heads.

Enter state machines. The idea is to model the player's behavior by assigning them a single "state" to be in. When a player is in a "state", they can "transition" to another state if a condition is met, which replaces the current state with a new one. If we design our states and transitions correctly, we can control the amount of info we need to keep in our head when writing new features.

I find the state machine from the [Wikipedia article on state machines][wikipedia] to be a great example:

<figure>
    <img alt="A state machine modelling a turnstile" src="/blog/phaser-finite-state-machine/example-state-machine.svg">
    <figcaption>A state machine diagram for a subway turnstile. The "Locked" state is the initial state.</figcaption>
</figure>

The diagram above illustrates a subway turnstile that is locked until you drop a coin into it, which unlocks it and allows one person to walk through before becoming locked again. The state machine has two states:

- **Locked**: The turnstile is locked. Pushing it will not let you through and remain in the "Locked" state, but inserting a coin will transition to the "Open" state.
- **Unlocked**: The turnstile is unlocked. Inserting another coin will keep the turnstile "Unlocked", but pushing it will allow you through and transition back to the "Locked" state.

In the same way that this diagram models the behavior of the real turnstile, we can create a similar diagram that models how we want our player to behave:

<figure>
    <img alt="A state machine modelling the hero" src="/blog/phaser-finite-state-machine/hero-state-machine.svg">
    <figcaption>I am not the best diagram-maker.</figcaption>
</figure>

The entire diagram itself is a little messy, but the point is that this model allows us to implement each state in isolation, resulting in cleaner, easier-to-maintain code.

### Coding a State Machine

We're going to create a `StateMachine` class that handles storing the current active state, storing a list of all possible states, and transitioning from the current state to a new state. But transitioning alone doesn't really _do_ anything.

Besides transitioning, we also want to:

- Run a function when we first transition to a new state. This lets us modify the hero when we transition between states, like starting the attack animation when we enter the `swing` state. We'll call this the `enter` function.
- Run a function during each `update` call depending on the current state. We'll call this the `execute` function.

There are several options for how to represent a state in our code. One is to use classes, which allows us to inherit from a base `State` class to get default `enter` and `execute` functions.

```diff
@@ -1,5 +1,46 @@
 /* global Phaser */

+class StateMachine {
+  constructor(initialState, possibleStates, stateArgs=[]) {
+    this.initialState = initialState;
+    this.possibleStates = possibleStates;
+    this.stateArgs = stateArgs;
+    this.state = null;
+
+    // State instances get access to the state machine via this.stateMachine.
+    for (const state of Object.values(this.possibleStates)) {
+      state.stateMachine = this;
+    }
+  }
+
+  step() {
+    // On the first step, the state is null and we need to initialize the first state.
+    if (this.state === null) {
+      this.state = this.initialState;
+      this.possibleStates[this.state].enter(...this.stateArgs);
+    }
+
+    // Run the current state's execute
+    this.possibleStates[this.state].execute(...this.stateArgs);
+  }
+
+  transition(newState, ...enterArgs) {
+    this.state = newState;
+    this.possibleStates[this.state].enter(...this.stateArgs, ...enterArgs);
+  }
+}
+
+class State {
+  enter() {
+
+  }
+
+  execute() {
+
+  }
+}
+
+
 const config = {
   type: Phaser.AUTO,
   width: 400,
```

There are two things to note in the code above:

- `possibleStates` is an object whose keys refer to the state name, and whose values are instances of the `State` class (or subclasses). We assign the `stateMachine` property on each instance so that they can call `this.stateMachine.transition` whenever they want to trigger a transition.
- `stateArgs` is a list of arguments passed to the `enter` and `execute` functions. This lets us pass commonly-used values (such as the hero or the current Phaser scene) to the state methods.

With this state machine implementation, we can replace our nest of `if` statements with classes for each state we modeled on our diagram:

```diff
@@ -27,7 +68,14 @@
       // The movable character
       this.hero = this.physics.add.sprite(200, 150, 'hero', 0);
       this.hero.direction = 'down';
-      this.hero.swinging = false;
+
+      // The state machine managing the hero
+      this.stateMachine = new StateMachine('idle', {
+        idle: new IdleState(),
+        move: new MoveState(),
+        swing: new SwingState(),
+      }, [this, this.hero]);
+

       // Animation definitions
       this.anims.create({
@@ -83,50 +131,79 @@
     },

     update() {
-      // Stop movement from last update
-      let moving = false;
-      this.hero.setVelocity(0);
-
-      // If we're swinging a sword, wait for the animation to finish
-      if (!this.hero.swinging) {
-        // Swinging a sword overrides movement
-        if (this.keys.space.isDown) {
-          this.hero.swinging = true;
-          this.hero.anims.play(`swing-${this.hero.direction}`, true);
-          this.hero.once('animationcomplete', () => {
-            this.hero.anims.play(`walk-${this.hero.direction}`, true);
-            this.hero.swinging = false;
-          });
-        } else {
-          // Set new velocity based on input
-          if (this.keys.up.isDown) {
-            this.hero.setVelocityY(-100);
-            this.hero.direction = 'up';
-            moving = true;
-          } else if (this.keys.down.isDown) {
-            this.hero.setVelocityY(100);
-            this.hero.direction = 'down';
-            moving = true;
-          }
-          if (this.keys.left.isDown) {
-            this.hero.setVelocityX(-100);
-            this.hero.direction = 'left';
-            moving = true;
-          } else if (this.keys.right.isDown) {
-            this.hero.setVelocityX(100);
-            this.hero.direction = 'right';
-            moving = true;
-          }
-
-          if (!moving) {
-            this.hero.anims.stop();
-          } else {
-            this.hero.anims.play(`walk-${this.hero.direction}`, true);
-          }
-        }
-      }
+      this.stateMachine.step();
     },
   }
 };

+class IdleState extends State {
+  enter(scene, hero) {
+    hero.setVelocity(0);
+    hero.anims.play(`walk-${hero.direction}`);
+    hero.anims.stop();
+  }
+
+  execute(scene, hero) {
+    const {left, right, up, down, space} = scene.keys;
+
+    // Transition to swing if pressing space
+    if (space.isDown) {
+      this.stateMachine.transition('swing');
+      return;
+    }
+
+    // Transition to move if pressing a movement key
+    if (left.isDown || right.isDown || up.isDown || down.isDown) {
+      this.stateMachine.transition('move');
+      return;
+    }
+  }
+}
+
+class MoveState extends State {
+  execute(scene, hero) {
+    const {left, right, up, down, space} = scene.keys;
+
+    // Transition to swing if pressing space
+    if (space.isDown) {
+      this.stateMachine.transition('swing');
+      return;
+    }
+
+    // Transition to idle if not pressing movement keys
+    if (!(left.isDown || right.isDown || up.isDown || down.isDown)) {
+      this.stateMachine.transition('idle');
+      return;
+    }
+
+    hero.setVelocity(0);
+    if (up.isDown) {
+      hero.setVelocityY(-100);
+      hero.direction = 'up';
+    } else if (down.isDown) {
+      hero.setVelocityY(100);
+      hero.direction = 'down';
+    }
+    if (left.isDown) {
+      hero.setVelocityX(-100);
+      hero.direction = 'left';
+    } else if (right.isDown) {
+      hero.setVelocityX(100);
+      hero.direction = 'right';
+    }
+
+    hero.anims.play(`walk-${hero.direction}`, true);
+  }
+}
+
+class SwingState extends State {
+  enter(scene, hero) {
+    hero.setVelocity(0);
+    hero.anims.play(`swing-${hero.direction}`);
+    hero.once('animationcomplete', () => {
+      this.stateMachine.transition('idle');
+    });
+  }
+}
+
 window.game = new Phaser.Game(config);
```

This is a lot to unpack. Some highlights of the changes:

- We can remove the `swinging` variable now, as it's been effectively replaced by `swing` being the current state. Since `SwingState` doesn't do anything in it's `execute` function, there's no fear of accidentally moving during the swing.
- Note how the transitions from the state machine we modeled above typically appear as early `if` statements that transition and return if their condition passes.
- Some code is repeated, such as checking if the spacebar is being pressed and transitioning to the `swing` state. You could factor these out to avoid repeated code, but I find that ends up coupling code in a way that is harder to maintain vs keeping them separate.

### Okay but why?

At first glance it may seem that the state machine code is longer than the old `update` method and more complex, and to some degree this is true. The reduction in complexity is not due to less code, but is instead due to less cognitive load. When we're working on the move state, we don't have to think about interfering with the idle and swing state logic as much as we previously did.

Let's say we want to add a dash in the current direction when the Shift key is pressed. Under the old code, we'd have to figure out where in the nest of `if` statements to check the shift key, and then probably add another level of conditions to avoid moving or attacking during a dash. With a state machine, we can add a new `dash` state and modify the existing states that can validly transition to a dash:

```diff
@@ -74,6 +74,7 @@
         idle: new IdleState(),
         move: new MoveState(),
         swing: new SwingState(),
+        dash: new DashState(),
       }, [this, this.hero]);


@@ -144,7 +145,7 @@
   }

   execute(scene, hero) {
-    const {left, right, up, down, space} = scene.keys;
+    const {left, right, up, down, space, shift} = scene.keys;

     // Transition to swing if pressing space
     if (space.isDown) {
@@ -152,6 +153,12 @@
       return;
     }

+    // Transition to dash if pressing shift
+    if (shift.isDown) {
+      this.stateMachine.transition('dash');
+      return;
+    }
+
     // Transition to move if pressing a movement key
     if (left.isDown || right.isDown || up.isDown || down.isDown) {
       this.stateMachine.transition('move');
@@ -162,7 +169,7 @@

 class MoveState extends State {
   execute(scene, hero) {
-    const {left, right, up, down, space} = scene.keys;
+    const {left, right, up, down, space, shift} = scene.keys;

     // Transition to swing if pressing space
     if (space.isDown) {
@@ -170,6 +177,12 @@
       return;
     }

+    // Transition to dash if pressing shift
+    if (shift.isDown) {
+      this.stateMachine.transition('dash');
+      return;
+    }
+
     // Transition to idle if not pressing movement keys
     if (!(left.isDown || right.isDown || up.isDown || down.isDown)) {
       this.stateMachine.transition('idle');
@@ -204,6 +217,32 @@
       this.stateMachine.transition('idle');
     });
   }
+}
+
+class DashState extends State {
+  enter(scene, hero) {
+    hero.setVelocity(0);
+    hero.anims.play(`swing-${hero.direction}`);
+    switch (hero.direction) {
+      case 'up':
+        hero.setVelocityY(-300);
+        break;
+      case 'down':
+        hero.setVelocityY(300);
+        break;
+      case 'left':
+        hero.setVelocityX(-300);
+        break;
+      case 'right':
+        hero.setVelocityX(300);
+        break;
+    }
+
+    // Wait a third of a second and then go back to idle
+    scene.time.delayedCall(300, () => {
+      this.stateMachine.transition('idle');
+    });
+  }
 }

 window.game = new Phaser.Game(config);
```

### Is this fast?

No idea. I haven't hit issues with my own game. I'm not terribly concerned about performance as my game is just a demo right now, so take that with a grain of salt.

I don't think there's any glaring issues with it performance-wise, but I suspect having a bunch of state machines running each update loop might start to cause issues with their overhead. Some clever engineering could reuse states or even state machines between sprites, which might help.

### What else could we do with this?

There's a lot of ideas I haven't touched upon here that are worth exploring:

- If states are classes, it stands to reason you can make more than one instance and accept parameters in their constructor.
- States could also subclass other states to share common logic or code between them.
- In my personal game, there are `exit` handlers as well as `enter` ones.

### Final Project

Here's the final version of the code used for this post, available as another Glitch project for your reading and remixing pleasure:

<div class="glitch-embed-wrap">
  <iframe
    allow="geolocation; microphone; camera; midi; encrypted-media"
    src="https://glitch.com/embed/#!/embed/phaser-fsm-example?path=public/client.js&previewSize=40"
    alt="phaser-fsm-example on Glitch"
    style="height: 100%; width: 100%; border: 0;">
  </iframe>
</div>

[Phaser]: https://phaser.io/
[Glitch]: https://glitch.com/
[wikipedia]: https://en.wikipedia.org/wiki/Finite-state_machine
