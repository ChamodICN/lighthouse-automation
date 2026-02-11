# lighthouse-automation
For kate's weekly page speed reports

run cmd as admin

# move to folder
cd C:\Users\Gray\Documents\Lighthouse\lighthouse-automation

# for normal
node lighthouse-batch.js

# for test (first 2 sites)
node lighthouse-batch.js --limit=2

# for no throttling
node lighthouse-batch.js --limit=2 --no-throttling