---
template: blog-post
title: "Data Collection at Mozilla: Browser Errors"
date: 2018-04-11 10:02:00 -0700
tags:
  - mozilla
---
I’ve spent the past few months working on a project involving data collection from users of Nightly, the pre-release channel of Firefox that updates twice a day. I’d like to share the process from conception to prototype to illustrate

1. One of the many ways ideas become reality at Mozilla, and
2. How we care about and protect user privacy with regards to data collection.

## Maybe JavaScript errors are a bad thing

The user interface of Firefox is written in JavaScript (along with [XUL][], HTML, and CSS). JavaScript powering the UI is “privileged” JavaScript, which is separate from JavaScript in a normal webpage, and can do things that normal webpages cannot do, such as read the filesystem.

When something goes wrong and an error occurs in this privileged JavaScript (let’s call them “browser errors”), it ends up logged to the [Browser Console][]. Most users aren’t looking at the Browser Console, so these errors often go unnoticed.

While working on [Shield][], I found that our QA cycle[^1] involved a lot of time noticing and reporting errors in the Browser Console. Our code would often land on the [Nightly channel][] before QA review, so why couldn’t we just catch errors thrown from our code and report them somewhere?[^2]

[XUL]: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL
[Browser Console]: https://developer.mozilla.org/en-US/docs/Tools/Browser_Console
[Shield]: https://wiki.mozilla.org/Firefox/Shield
[Nightly channel]: https://www.mozilla.org/en-US/firefox/channel/desktop/
[^1]: Firefox uses tons of automated testing, but we also have manual testing for certain features. In Shield's case, the time being wasted was in the manual phase.
[^2]: Actually, we already do collect crashes as part of the [Socorro][] project, which I currently work on. But Socorro does not collect any info about the browser errors in question.
[Socorro]: http://socorro.readthedocs.io/en/latest/

## So let’s a great plan

I told my boss a few times that browser error collection was a problem that I was interested in solving. I was pretty convinced that there was useful info to be gleaned from collecting these errors, but my beliefs aren’t really enough to justify building a production-quality error collection service. This was complicated by the fact that errors may contain info that can personally identify a user:

- There’s no limits or checks on what goes into an error message in Firefox, so we can’t guarantee that error messages don’t contain things like, say, an auth token for a URL that we couldn’t connect to.
- Tracebacks for errors may signal that a user was using a specific feature in Firefox, like private browsing. It’s not clear whether “user was using private browsing” is private user data or not, but it’s gray enough to be concerning.

On top of all that, we didn’t even know how often these errors were occurring in the wild. Was this a raging fire of constant errors we were just ignoring, or was I getting all worried about nothing?

In the end, I proposed a 3-step research project:

1. Run a study to measure the number of errors occurring in Nightly as well as the distribution of signatures.
2. Estimate potential load using the study data, and build a prototype service. Grant access to the data to a limited set of employees and discover whether the data helps us find and diagnose errors.
3. Shut down the prototype after 6 months or so and evaluate if we should build a production version of the system.

I wrote up this plan as [a document][prd] that could be shared among people asking why this was an important project to solve. Eventually, my boss threw the idea past Firefox leadership, who agreed that it was a problem worth pursuing.

[prd]: https://docs.google.com/document/d/1FAoRLP19hvVFniQniOC9N5jxSUpITCrUs1SiXdhrOEM/edit?usp=sharing

## What even is happening out there

The first step was to find out how many errors we’d be collecting. One tool at our disposal at Mozilla is Shield, which lets us run small studies at targeted subsets of users. In this case, I wanted to collect data on how many errors were being logged on the Nightly channel.

To run the study, I had to fill out a [Product Hypothesis Document (PHD)][phd] describing my experiment. The PHD is approved by a group in Mozilla with data science and experiment design experience. It’s an important step that checks multiple things:

- Do you know how to interpret the results of your experiment? Is success vs failure clear?
- Have you enumerated the user data you’ll need to collect? Mozilla has a classification system for user data that needs to be applied to prevent collection of sensitive data.
- Are you sending your experiment to the minimally-effective group? If we can make do with only collecting data from 3000 users rather than 30,000, we should avoid the over-collection of data.

Once the PHD was approved, I implemented the code for my study and created a [Bugzilla bug][bug] for final review. Mozilla has a group of “data stewards” who are responsible for reviewing data collection to ensure it complies with our policies. Studies are not allowed to go out until they’ve been reviewed, and the results of the review are, in most cases, public and available in Bugzilla.

In our case, we decided to compute hashes from the error stacktraces and submit those to Mozilla’s data analysis pipeline. That allowed us to count the number of errors and view the distribution of specific errors without accidentally collecting personal data that may be in file paths.

[phd]: https://docs.google.com/document/d/1iHRNYY9kB8R9ecT4YSMhcDRaJsDzLSKwrJnlsoi_WNA/edit?usp=sharing
[bug]: https://bugzilla.mozilla.org/show_bug.cgi?id=1423784

### I am perfect and infallible

The last steps after passing review in the bug were to announce the study on a few mailing lists to both solicit feedback from Firefox developers, and to inform our release team that we intended to ship a new study to users. Once the release team approved our launch plan, we launched and started to collect data. Yay!

A few days after launching Ekr, who had noticed the study on the mailing lists, reached out and voiced some concerns with our study.

While we were hashing errors before sending them, an adversary could precompute the hashes by running Firefox, triggering bugs they were interested in, and generating their own hash using the same method we were using. This, paired with direct access to our telemetry data, would reveal that an individual user had run a specific piece of code.

It was unclear if knowing that a user had run a piece of code could be considered sensitive data. If, for example, the error came from code involved with private browsing mode, would that constitute knowing that the user had used private browsing mode for something? Was that sensitive enough for us to not want to collect?

We decided to turn the study off while we tried to address these concerns. By that point, we had collected 2-3 days-worth of data, and decided that the risk wasn’t large enough to justify dropping the data we already had. I was able to perform a limited analysis on that data and determine that we were seeing tens of millions of errors per day, which was enough of an estimate for building the prototype. With that question answered, we opted to keep the study disabled and consider it finished rather than re-tool it based on Ekr’s feedback.

## Can I collect the errors now

Mozilla already runs our own instance of [Sentry][] for collecting and aggregating errors, and I have prior experience with it, so it seemed the obvious choice for the prototype.

With roughly 50 million errors per-day, I figured we could sample sending them to the collection service at a rate of 0.1%, or about 50,000 per-day. The operations team that ran our Sentry instance agreed that an extra 50,000 errors wasn’t an issue.

I spent a few weeks writing up a Firefox patch that collected the errors, mangled them into a Sentry-compatible format, and sent them off. Once the patch was ready, I had to get a technical review from a Firefox peer and a privacy review from a data steward. The patch and review process can be seen in [the Bugzilla bug][collect-bug].

The process, as outlined on the [Data Collection wiki page][data-collection], involves three major steps:

[Sentry]: https://sentry.io/welcome/
[collect-bug]: https://bugzilla.mozilla.org/show_bug.cgi?id=1426482
[data-collection]: https://wiki.mozilla.org/Firefox/Data_Collection

### Requesting Review

First, I had to fill out a [form][] with several questions asking me to describe the data collection. I’m actually a huge fan of this form, because the questions force you to consider many aspects about data collection that are easy to ignore:

<dl>
    <dt><em>“Why does Mozilla need to answer these questions? Are there benefits for users? Do we need this information to address product or business requirements?”</em></dt>
    <dd>It’s really easy to let curiosity or mild suspicion drive big chunks of work. The point of this question is to force you to think of a reason for doing the collection. Collecting data just because it is mildly convenient or interesting isn’t a good enough reason; it needs a purpose.</dd>
    <dt><em>“What alternative methods did you consider to answer these questions? Why were they not sufficient?”</em></dt>
    <dd>Data collection can’t simply be the first tool you reach for to answer your questions. If we want to be respectful of user privacy, we need to consider other ways of answering questions that don’t involve collecting data.</dd>
    <dt><em>“List all proposed measurements and indicate the category of data collection for each measurement, using the Firefox data collection categories on the Mozilla wiki.”</em></dt>
    <dd>The <a href="">classification system we use for data</a> makes it very clear how to apply our policies to the data you’re collecting. Browser errors, for example, are mostly category 2 data, but may potentially contain category 3 data and as such must be held to a higher standard.</dd>
    <dt><em>“How long will this data be collected?”</em></dt>
    <dd>If we can limit the time period in which we collect a piece of data, we can reduce the impact of data collection on users. I didn’t actually know time-limited collection was something to consider until I saw this question for the first time, but in fact several of our data collection systems enforce time limits by default.</dd>
</dl>

[form]: https://github.com/mozilla/data-review/blob/fde1f65be2cfe8be68a48d307e261d3bd53af09d/request.md

### Reviewing Request

Data stewards have their own form to fill out when reviewing a collection request. This form helps stewards be consistent in their judgement. Besides reviewing the answers to the review form from above, reviewers are asked to confirm a few other things:

<dl>
    <dt><em>Is the data collection documented in a publicly accessible place?</em></dt>
    <dd>Sufficiently technical users should be able to see the schema for data being collected without having to read through the Firefox source code. Failing to provide this documentation mandates a failing review.</dd>
    <dt><em>Is there a way for users to disable the collection?</em></dt>
    <dd>There must be some way for users to disable the data collection. Missing this is also considered grounds for failure.
    <br><br>
    It’s important to note that this mechanism doesn’t need to be, say, a checkbox in the preferences UI. Depending on the context of the data collection, an about:config preference or some other mechanism may be good enough.</dd>
</dl>

### Rereing Viewquest?

In certain cases, requests may be escalated to Mozilla’s legal team if they involve changes to our privacy policy or other special circumstances. In the case of browser error collection, we wanted a legal review to double-check whether a user having used private browsing mode was considered category 2 or 3 data, as well as to approve our proposal for collecting category 3 data in error messages and file paths.

Our approach was to mimic what Mozilla already does with crashes; we collect the data and restrict access to the data to a subset of employees who are individually approved access. This helps make the data accessible only to people who need it, and their access is contingent on employment[^3]. Legal approved the plan, which we implemented using built-in Sentry access control.

[^3]: Only some parts of crash data are actually private, and certain contributors who sign an NDA are also allowed access to that private data. We use centralized authorization to control access.

## Welcome to errortown

With code and privacy review finished, I landed the patch and waited patiently for Sentry to start receiving errors. And it did!

Since we started receiving the data, I’ve spent most of my time recruiting Firefox developers who want to search through the errors we’re collecting, and refining the data we’re collecting to make it more more useful to those developers. Of course, changes to the data collection require new privacy reviews, although the smaller the changes are, the easier it is to fill out and justify the data collection.

But from my standpoint as a Mozilla employee, these data reviews are the primary way I see Mozilla making good on its promise to respect user privacy and avoid needless data collection. A lot of thought has gone into this process, and I can personally attest to their effectiveness.
