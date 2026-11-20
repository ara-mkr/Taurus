#!/bin/sh
# Run once, yourself, on the Mac that runs Taurus (owner's step, November 5, 2026; docs/19-computer-use.md).
# macOS ties Screen Recording and Accessibility to an app's code signature. Taurus's builds were signed ad hoc, so each
# new build looked like a new app and lost both permissions. This makes a self-signed code-signing certificate named
# "Taurus Local" in your login keychain; `pnpm desktop:build` then signs every build with it, and the permissions stay.
# It is good only for signing apps on this Mac: no Apple account, nothing published, nothing trusted for websites.
# macOS asks for your login password to trust it for code signing.
set -eu
NAME="Taurus Local"
if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then echo "\"$NAME\" is already in your keychain."; exit 0; fi
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
cat > "$DIR/cert.cnf" <<CNF
[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$DIR/cert.cnf" -keyout "$DIR/key.pem" -out "$DIR/cert.pem" 2>/dev/null
PASS=$(openssl rand -hex 16)
openssl pkcs12 -export -legacy -inkey "$DIR/key.pem" -in "$DIR/cert.pem" -name "$NAME" -passout "pass:$PASS" -out "$DIR/cert.p12" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$DIR/key.pem" -in "$DIR/cert.pem" -name "$NAME" -passout "pass:$PASS" -out "$DIR/cert.p12"
security import "$DIR/cert.p12" -k "$HOME/Library/Keychains/login.keychain-db" -P "$PASS" -T /usr/bin/codesign
security add-trusted-cert -p codeSign -k "$HOME/Library/Keychains/login.keychain-db" "$DIR/cert.pem"
echo "Made \"$NAME\". Build Taurus again (pnpm desktop:build), then switch on Screen Recording and Accessibility for the new build."
