# Lint + tests (non-destructive)
check:
    node --check Code.js
    node test.js

# Run parsing regression tests
test:
    node test.js

# Push to Apps Script (runs tests first)
deploy:
    ./deploy.sh
