# Code signing policy

Free code signing for PluMd is provided by [SignPath.io](https://about.signpath.io/), with a certificate issued by the [SignPath Foundation](https://signpath.org/).

Applies to: `PluMd-Setup-X.Y.Z.exe` and `PluMd-portable-X.Y.Z.exe`, as published on the [releases](https://github.com/jfr1504/pluMd/releases) page.

## What is signed

Only binaries built from the source code in this repository, by the GitHub Actions workflow `.github/workflows/compilar-y-publicar.yml`, when a `vX.Y.Z` tag is pushed. Nothing is signed from a developer's computer. The product name in the signed files is `PluMd`.

## Team roles

<!-- TO CONFIRM: members and roles. Every member needs multi-factor authentication on GitHub and on SignPath. -->

- Authors (trusted committers): Jorge Ferreira Rey ([@jfr1504](https://github.com/jfr1504)).
- Reviewers (review changes from contributors who are not Authors): Jorge Ferreira Rey.
- Approvers (approve each signing request): Jorge Ferreira Rey.

Changes from other contributors reach `main` only through a Pull Request reviewed by a Reviewer.

## Privacy policy

PluMd does not send any data to any server, collects no telemetry and has no automatic update check. It only reads and writes the files the user opens or creates. Remote images (https) in a document are downloaded only after the user clicks «Cargar» [Load] on each one.

## System changes

The installer (`PluMd-Setup`) installs the program for the current user in a folder the user can choose, adds a Start menu shortcut and registers `.md` and `.markdown` files so they open with PluMd. It includes an uninstaller (Windows Settings > Apps). The portable version (`PluMd-portable`) installs nothing and changes no system settings; to remove it, delete the file.
