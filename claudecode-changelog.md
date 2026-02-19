## Claude Desktop Cowork Features

Claude Cowork is a research preview feature that brings agentic AI capabilities to Claude Desktop for knowledge work beyond coding. Initially launched for Max plans on January 12, 2026, it was expanded to Pro plans on January 16, 2026, and is now available on both macOS and Windows (x64 only). [support.claude](https://support.claude.com/en/articles/12138966-release-notes)

## Core Capabilities

**Direct Local File Access**
Claude can read from and write to your local files without manual uploads or downloads. You grant Claude access to specific folders, and it can read, edit, create, and organize files within those directories. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Sub-Agent Coordination**
Claude breaks complex work into smaller tasks and coordinates parallel workstreams to complete them simultaneously. For complex projects, Claude may spin up multiple sub-agents working on different aspects of a task at the same time. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Professional Output Generation**
Generate polished deliverables including Excel spreadsheets with working formulas, PowerPoint presentations, formatted documents, and PDFs directly in your file system. Unlike simple exports, these are fully functional files with proper formatting, formulas, and structure. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Long-Running Tasks**
Work on complex tasks for extended periods without conversation timeouts or context limits interrupting your progress. Claude can continue working on multi-step projects while you step away, delivering finished work when you return. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## How Cowork Works

Cowork runs in an isolated virtual machine (VM) environment directly on your computer. When you start a task, Claude analyzes your request, creates a plan, breaks complex work into subtasks when needed, executes work in the VM, coordinates multiple workstreams in parallel, and delivers finished outputs to your file system. You maintain visibility throughout the process with progress indicators showing what Claude is doing at each step. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## Plugin System

Cowork includes a library of pre-built plugins for common knowledge work functions: [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

- **Productivity** — Manage tasks, calendars, and daily workflows
- **Enterprise search** — Find information across company tools and docs
- **Sales** — Research prospects and prep deals
- **Finance** — Analyze financials and build models
- **Data** — Query, visualize, and interpret datasets
- **Legal** — Review documents and flag risks
- **Marketing** — Draft content and plan campaigns
- **Customer support** — Triage issues and draft responses
- **Product management** — Write specs and prioritize roadmaps
- **Biology research** — Search literature and analyze results

You can also use the "Plugin Create" plugin to build custom plugins, or upload your own plugin files. All Anthropic-built plugins are available on [GitHub](https://github.com/anthropics/knowledge-work-plugins). [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## Customization Options

**Global Instructions**
Set standing instructions that apply to every Cowork session, such as your preferred tone, output format, or background about your role. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Folder Instructions**
Add project-specific context when you select a local folder, which Claude can also update during a session. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## Example Use Cases

**File Management** — Organize downloads by type and date, batch rename files with consistent patterns, or process receipts into formatted expense reports. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Research and Analysis** — Synthesize information from web searches and notes into reports, extract themes and action items from meeting transcripts, or analyze personal notes to surface patterns and connections. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Document Creation** — Generate Excel files with working VLOOKUP and conditional formatting, create slide decks from rough notes, or turn voice memos into polished documents. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

**Data Analysis** — Perform outlier detection and time-series analysis, generate charts from your data, or clean and transform datasets. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## Security Features

Cowork requires explicit user permission before permanently deleting any files. The VM environment provides isolation from your main operating system while giving Claude controlled access to files and network resources you've granted permission to use. You can control which MCP servers Claude connects to and manage Claude's internet access through settings. [support.claude](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

## Current Limitations

Cowork does not retain memory from previous sessions, cannot share chats or artifacts with others, is only available on desktop (no mobile or web), and requires the desktop app to remain open for sessions to continue. [support.claude](https://support.claude.com/en/articles/12138966-release-notes)