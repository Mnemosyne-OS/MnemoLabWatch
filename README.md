<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# Lab Watch

The new publications of the AI labs, every day, in one window.

> The name is provisional: no trademark search has been done.

Lab Watch is a cartridge for [Mnemosyne OS](https://github.com/Mnemosyne-OS).
It hands the host's background watch six targets: one OpenAlex list per lab
(OpenAI, Anthropic, Google DeepMind, Meta, Mistral AI) and the OpenAI news
feed. The host checks them once a day while Mnemosyne OS runs, window closed
or not. When you open Lab Watch, it lists what arrived since you last looked,
by lab, with the publication date, the day it was picked up and a link.

Design and measurements: `docs/architecture/187_research-crossing-lab-publications.md`.

## Sources

| Source | What it gives | Read by |
|---|---|---|
| OpenAlex, one list per lab | articles and preprints, Zenodo deposits left out, newest 50 | the host's watch (`json` mode), then the frame for the details |
| `openai.com/news/rss.xml` | every OpenAI post; research categories listed, the rest folded | the host's watch (`atom` mode), then `social.fetch` |

- A work belongs to a lab when one of its authors does, as OpenAlex attributes
  it. The card says so.
- The first pass of the watch announces nothing.
- An abstract under 20 words is marked too short to read.

## Your topics

Write a few topics in your words. On a click, the app's model reads each new
abstract and says which topic it touches, quoting a sentence of the abstract
word for word, or that it touches none. The number of model calls is on the
button; the credits spent are measured on the balance afterwards. Verdicts are
kept, so reopening the window costs nothing.

The lot 0 measure of this judge (103 lab publications labelled by hand) is
ready behind `?bench=lot0` on the frame address. It has not been run.

## Cross a text

Load a lab's publications (one OpenAlex credit per 200), paste or pick your
text (txt, md, pdf, docx). Each passage is shown the five publications
closest by their words and judged: supported, partly, diverges (both quotes
side by side, yours to judge) or absent, which always says out of how many.
A publication with an open PDF can be read in full; its passages then join
the comparison.

## Permissions

- `watch:background`: the host keeps checking while the window is closed.
- `vault:read`: the gate of `social.fetch` (the OpenAI feed, no CORS header)
  and of `reader.downloadUrl` / `reader.extractDocument` (open PDFs, your
  PDF or Word file). Lab Watch reads no vault.
- `model:infer`: the judge.
- `wallet:read`: the credit balance, to measure what a reading cost.
- `dialog:open`: picking and reading your file.

## Run it

```bash
pnpm dev     # vite on 127.0.0.1:5246
pnpm test
pnpm typecheck
```

Outside Mnemosyne OS the window says it has no host. A local stand-in that
answers like the host lives in `.preview/host.html` (gitignored).

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
