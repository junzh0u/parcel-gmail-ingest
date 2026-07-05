# Run parsing regression tests (a Code.js syntax error fails the suite at load)
check:
    bun run test.js

# Alias for check
test:
    bun run test.js

# Push to Apps Script (runs tests first)
deploy:
    ./deploy.sh
