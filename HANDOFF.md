# Your Ledger: a hand-off from Alex

Hi Alicia. This is your money app. Alex and I set it up on September 7, 2026, on your own
accounts, and from here on it's yours to run and change. This file explains what it is, how it
thinks about your money, and how to work on it with Claude Code. Read it once now, then keep it
around for the day you want to change something.

You don't need to know how to program. You need to know what you want, say it in plain words,
and check the result. That's most of the job.

---

## 1. What this is

A private website, just for you, at **https://ledger.alistation.net**. You sign in with your
Google account. It connects to your banks through a service called Plaid, reads your balances
and transactions (it can only read, never move money), and shows you:

- **Overview**: what's free to spend, what's parked, your net worth, recent activity.
- **Cash**: your checking and credit-union savings, the paycheck split, and your goals.
- **Savings**: your Amex High Yield Savings and the interest it earns.
- **Investments**: your Vanguard accounts and what's in them.
- **Transactions**: everything, with a category on each one that you can correct.
- **Budgets**: monthly targets per category, and goals for specific things.
- **Income**: your paychecks and how each one was split.
- **Settings**: the bank connections, plus manual accounts for anything a bank can't report.

Nobody else can sign in. The only Google account that works is yours.

## 2. How it thinks about your money

This is the part worth understanding, because every number on the screen comes from it.

**Every paycheck gets split on arrival.** When payroll lands in your credit-union savings, the
app writes down a split: 10% to a **Buffer** (an emergency cushion), 15% to **Investing** (money
meant for Vanguard), and the remaining 75% is **Living** money. Nothing actually moves between
accounts. The app just keeps track of whose money is whose inside that savings balance. You can
change the percentages any time on the Cash page under Adjust.

**Buckets are a floor, not separate accounts.** The Buffer and Investing amounts are the minimum
the app thinks should stay in savings. The Cash page shows that minimum against the real balance.

**Free to spend** is your checking balance minus what's already on your credit card. That's the
money that can leave today without touching savings and without coming up short when the card
autopays. It's usually a small number, and that's correct.

**Everything else in savings is "parked."** Some of it is held by the buckets and goals. The rest
the app calls **unassigned**: parked, but with no job yet. If that number feels big, give some of
it a job with a goal, or move it to the Amex savings where it earns more.

**Goals** are for one specific thing: a trip, a laptop, a deposit. On the Budgets page, make a
goal with a name, an optional target, an optional date, and optionally a slice of every paycheck.
The moment money goes into a goal it stops counting as free. When you spend it, record that on
the Cash page under Adjust, then Move money.

**Investing shows "ahead."** You send $583 a month to Vanguard, and 15% of your net pay is about
$500. So the Investing bucket runs a little behind what you actually invest, and the app says
"ahead by" rather than showing a negative number. If you'd like the numbers to line up, set
Investing to 17% on the Cash page. That's your call; the app won't decide it for you.

**Categories come from rules.** Every transaction gets a category. Open one on the Transactions
page to change it. After you pick, it offers to make that a rule, so everything that looks like
it gets the same category from then on. The rules are the truth; Plaid's guesses are only a starting point.

## 3. The accounts that make it run

All of these are in your name and under your logins. Keep the passwords somewhere safe.

| Service | What it does | Where |
|---|---|---|
| GitHub | Stores the code | github.com/SovereignAli/aliciaos-ledger |
| Vercel | Runs the website | vercel.com, team "Ali's Projects", project aliciaos-ledger |
| Neon | The database | neon.tech, project AliciaOS Ledger |
| Clerk | Sign-in | dashboard.clerk.com, application AliciaOS Ledger |
| Plaid | Bank connections | dashboard.plaid.com |
| Namecheap | Your domain alistation.net | namecheap.com |

You'll rarely need to open any of them. The two you might: **Plaid**, if a bank asks to be
reconnected and the in-app button doesn't do it; and **Vercel**, to see whether a change
published. Everything else runs on its own.

## 4. Working on it with Claude Code

Claude Code is a program that reads and edits the code for you when you describe what you want.
Here's the routine.

**Setting up (once).**

1. Install Claude Code and sign in with your own Anthropic account.
2. Open it in the project folder. On this PC that's `C:\Users\alici\code\aliciaos-ledger`.
   In the desktop app, choose that folder as the project. In a terminal, go to that folder first.
3. Say hello and ask it to read `CLAUDE.md`. That file is its briefing: what's been decided and
   why, so it doesn't undo good decisions. `HANDOFF.md` is this file, written for you.

**Asking for a change.** Describe the outcome, not the code. Good examples:

- "On the overview, I want the Free to spend number to be just my checking balance, not minus the card."
- "Add a goal called Portugal, target 2,500, 100 from each paycheck, by next June."
- "The Uber Eats charges are going under Shopping. They should be Food & drink, always."
- "Show me a screenshot of the Savings page in light mode."

Then read what it did. It will usually show you a screenshot or tell you exactly what changed.
If it's not what you meant, say so in plain words. It doesn't mind.

**The four things you'll hear it say, and what they mean.**

- "Run the tests" or "typecheck": it's checking its own work. Good sign.
- "Commit": saving a snapshot of the change into the code's history, with a note.
- "Push": sending that snapshot to GitHub, so it's backed up and shared.
- "Deploy": publishing to the live website. Until Vercel is connected to GitHub (section 6),
  deploying is done from this PC with a command. Claude Code knows the command.

A safe habit: after any change, ask "commit and push, then deploy." If something looks wrong on
the live site afterwards, ask it to "put back the previous version."

**Things Claude Code should never do, and will refuse if it's working properly.**

- Type your passwords, bank logins, or secret keys anywhere. You paste those yourself.
- Move money. The app can't; it only reads.
- Share the file `.env.local`. That file holds the keys to the database and the bank connection.
  It lives only on this PC, is never uploaded, and should never be pasted into a chat.

## 5. Routine things

**A bank stops updating.** Settings page, the bank's row, click Reconnect. That opens Plaid and
you sign in to the bank again. Happens every few months with credit unions; it's normal.

**A transaction has the wrong category.** Transactions page, click it, pick the right one, and
say yes when it offers to make a rule if it should always be that.

**Changing the split.** Cash page, Adjust, Split. Paychecks from that date on use the new split.

**Something looks off.** Ask Claude Code: "The number for X looks wrong, can you check where it
comes from?" It can read the database and explain. Don't guess; ask.

**Bringing in older history.** The credit union gave Plaid only about six months. If you want
the earlier paychecks in the app, export a CSV from the credit union's website and tell Claude
Code "import this file." It knows how.

## 6. Loose ends we left for you

None of these are urgent. They're here so you know.

- **Amex savings should count as long-term savings.** Cash page, the menu on the Amex row,
  choose Long-term savings. That moves it to the Savings tab, and the "unassigned" figure on
  the overview drops by about fourteen thousand.
- **Investing percentage.** 15% now; 17% would match what you really send to Vanguard.
- **Connect Vercel to GitHub**, so every push publishes on its own. In Vercel's account settings,
  under Authentication, connect GitHub. Then tell Claude Code "link the Vercel project to my
  GitHub repo." After that you never deploy by hand.
- **Chase-style banks.** If you ever add a bank that uses a login popup (Chase, Capital One's
  web login, Wells Fargo), Plaid needs one line added in its dashboard first: Developers, then
  API settings, then Allowed redirect URIs, add `https://ledger.alistation.net/settings`.
- **The sign-in page still says "development" in the browser console.** Harmless. Making it
  production-grade is a half-hour job with Clerk and Google that Claude Code can walk you through
  when you want the warning gone.
- **The iPhone home-screen icon** is still Alex's old one. Ask Claude Code to make one from the
  purple mark.

## 7. A few words to be honest about

This app is one person's tool, not a product. It's good at what it does and it's simple on
purpose. It will occasionally show a number that makes you go "wait, what?" Nine times out of
ten that's a category that needs fixing or a bank that needs reconnecting, and both take a
minute. The tenth time, ask Claude Code to look, and it will find it.

The most useful thing you can do in the first month is correct categories as you notice them.
Every rule you set makes the next month's picture truer.

Alex is a message away for anything this file doesn't cover.
