# NodeJs Batch Job
NodeJS batch job will process transactions on Ethereum blockchain at specific date/time defined in input Exel sheet

# Output
_Log.xlsx_ containing transaction info  
**Important:** copy log.xlsx to another file before opening, the system can't write to an opening file

# Install
`npm install`

# Specify input file
Open `app.js` and set the path to the xlsx file at `inputFile` variable

# XLSX format
Follow the format of `test.xlsx`

# Execution
Start local blockchain at port 8545  
Execute `node app.js`

# TODO
Integrate a logging system

