# Desktop projects, delivered files, and permissions

Status: implementation authorized by user feedback on 2026-10-31.

The paired client must let its owner select projects saved in Codex App, download
files produced in a project, and change the permissions of an idle attached chat.

## Decisions

- Discover the desktop registry through experimental App Server `project/list`.
  Show the saved name and roots. Import only a selected registry root, persist that
  authorization, and retain configured roots for project creation. Never accept an
  arbitrary path as an import. Desktop metadata and global config are not modified.
- Offer authenticated project file browsing and attachment downloads. Link files
  changed by tools and local Markdown references in assistant messages. Resolve real
  paths, confine downloads to the selected project, reject private runtime/config
  paths and symlink escapes, and always serve as attachments.
- Display effective approval policy and sandbox from App Server start/resume and
  settings notifications. Offer read-only, workspace and full-access settings plus
  approval choices. Use `thread/settings/update` only while idle and attached;
  surface managed restrictions. Full access requires an explicit UI confirmation.
  Preserve choices on reconnect rather than hardcoding resume overrides.

## Acceptance and verification

Public test seams remain the authenticated HTTP API and the real App Server stdio
protocol, as agreed for the prototype. Verify a saved project outside startup roots
can be selected, arbitrary paths cannot be imported, generated Unicode/binary files
download byte-for-byte, traversal/private files cannot be downloaded, and settings
survive snapshot/reconnect while busy or unattached updates are rejected. Browser QA
covers desktop and phone widths. Use an isolated chat for live settings validation;
never send test prompts to existing user chats.
