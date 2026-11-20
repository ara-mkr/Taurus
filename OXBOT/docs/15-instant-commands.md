# 15. Instant commands and Taurus windows

Added November 4, 2026 at the owner's request ("hey taurus play juice wrld on spotify ... pull up a simple liquid glass window ... so it shows that it did it").

Say these after "Hey Taurus" (or tap Talk), type them in the chat bar, or say them on a phone call to Taurus. They're recognized on the Mac without the AI, so they answer at once and work with no AI connected. Each one pops a Taurus window in at the top right of every open screen. Say it some other way ("put on something sad") and the AI does the same thing with its tools.

## Music (Spotify)

| Say | Does |
|---|---|
| play Juice WRLD on Spotify · play Juice WRLD | Plays the artist |
| play Lucid Dreams by Juice WRLD · play the song Lucid Dreams | Plays that track |
| play the album Donda · play my chill playlist · play my liked songs | Album, your own playlist first, Liked Songs shuffled |
| pause · stop the music · resume · play | Pause and resume |
| skip · next song · go back · previous song | Track controls |
| turn it up · turn it down · volume 40 | Volume (±15, or exact) |
| what's this song | Reads the track and artist |
| shuffle · shuffle off | Shuffle |

The window shows the cover, title, artist, where it's playing, a live progress line, and Back, Pause and Skip. Setup: Settings → Actions → Spotify (your own Spotify app keys, same app as the Spotify connection). Spotify only lets Premium start music from another app; without Premium, or with no Spotify app open, the window shows Spotify's own player to press play on.

## Timers

| Say | Does |
|---|---|
| set a 10 minute timer for pasta · timer for 90 seconds · 1 hour 30 minute timer | Named timers, several at once |
| how long is left · show my timers | Reads them out and shows them |
| cancel the pasta timer · cancel all timers | Cancel by name |
| wake me up in 20 minutes | A "Wake up" timer |

Done: the window turns red, chimes every few seconds for a minute, and "stop", "okay" or "got it" closes it.

## Reminders

| Say | Does |
|---|---|
| remind me at 6 to call Mom | The next 6 o'clock, am or pm |
| remind me tomorrow at 9am to send the deck · remind me tonight to stretch · remind me on Friday at noon to … | Plain-words times |
| remind me every weekday at 8:30 to check the numbers · every day · every Monday | Repeating |
| remind me in 20 minutes to move the car | Relative |
| what are my reminders · cancel the reminder about the car · cancel all reminders | List and cancel |

When one is due: a red window with Done, In 10 minutes and In an hour, a chime, and a system notification if the tab is in the background and notifications are allowed.

## Focus

"lock in", "lock in for 45 minutes", "focus mode", "deep work": a focus timer (50 minutes by default), focus music if Spotify playback is set up, and VIP-mail rings held until it ends. A meeting starting still rings. "end focus" stops it.

## Memory

"remember that I take my coffee black", "remember Sam's birthday is March 3": saved in your words in `~/.taurus/memory.json` and sent to your chosen AI with every question, so answers use it. "what do you know about me" shows the list with Forget on each; "forget Sam's birthday" removes the closest match. The AI can only save a memory when your own message asked it to remember.

## Opening apps

"open YouTube", "pull up Gmail", "go to linear.app": opens it in a new tab (about 40 common apps by name, or any web address). If the browser holds the tab back, the window has the button. On a phone call it waits on your screen.

## Not instant

Anything that reaches other people (email, Slack, texts, calls, GitHub, Linear, Composio actions, food) still goes through an approval card. "play chess with me" and other non-music "play" phrases go to the AI.
