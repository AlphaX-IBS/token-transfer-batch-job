/**
 * This app scan input exel file for the EXECUTE_ON column (date) every 15 mins
 * If the record date time is within 15 mins from now, then get that record into cron job to execute that record at that exact date time
 * We can real-time edit the input exel file (add rows) without having to exit app
 * The output of this app should be an exel log file with 2 sheets: Succeed and Failed
 * Only ONE instance of this app should be run at a time
 */

//libraries
var fs = require('fs');
var XLSX = require('xlsx');
var moment = require('moment');
var Job = require('cron').CronJob;;
var Web3 = require('web3');
var Tx = require('ethereumjs-tx');
var web3 = new Web3('ws://127.0.0.1:8545'); //set the host here

//variables
var inputFile = 'test.xlsx';
var MAX_RETRIES = 3; //retry times for fail transactions
var intervals = 15; //minutes between each scan, must be integer

/*specify column headers names (case sensitive)*/
var COL_NAMES = {
    "FROM" : "From",
    "KEY" : "Private_key",
    "TO" : "To",
    "ETH" : "ETH",
    "EXECUTE_ON" : "Execute_on",
    "IS_CONTRACT" : "Is_gex_contract"
}
Object.freeze(COL_NAMES);

//main function
function execute(file){
    var workbook = XLSX.readFile(file,{
        dateNF : 'dd/mmm/yyyy h:mm:ss'
    });

    //we assume data are stored in first sheet
    var sheet = workbook.Sheets[workbook.SheetNames[0]];

    //convert to json to read
    var json = XLSX.utils.sheet_to_json(sheet);
    /*console.log(json);*/

    //get column and row numbers
    var rows = Object.keys(json).length;
    var columns = Object.keys(json[0]).length;

    //loop through data
    for(let i=0; i < rows; ++i){
        var exeTime = moment(new Date(json[i][COL_NAMES.EXECUTE_ON]));
        var now = moment();
        var diff = moment(exeTime).diff(now, 'seconds');
        if(diff > 0 && diff <= intervals * 60){
            setTimeout(()=>{
                makeTransaction(json[i], 0);
            }, diff * 1000);
        }
    }
}

async function makeTransaction(data, count){
    var sender = data[COL_NAMES.FROM];
    var key = data[COL_NAMES.KEY];
    var receiver = data[COL_NAMES.TO];
    var value = data[COL_NAMES.ETH];

    var privateKey = new Buffer(key, 'hex');
    var gas = await web3.eth.estimateGas({to: receiver});
    var nonce = await web3.eth.getTransactionCount(sender);

    var rawTx = {
        nonce: nonce,
        from: sender,
        to: receiver,
        value: web3.utils.toHex(web3.utils.toWei(value, 'ether')),
        gas: gas
    }

    var tx = new Tx(rawTx);
    tx.sign(privateKey);

    var serializedTx = tx.serialize();

    web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
        .then(receipt=>{
            console.log('\x1b[32m%s\x1b[0m', 'Successful, trasaction time '+moment().format('DD/MMM/YYYY hh:mm:ss'));
            log(data, receipt);
        })
        .catch(err=>{
            if(count == MAX_RETRIES){
                console.log('----------');
                console.log('\x1b[41m%s\x1b[0m','An error occurred, please check log file, transaction time: '+ moment().format('DD/MMM/YYYY hh:mm:ss'));
                console.log(err.message);
                console.log('----------');
                log(data, {status: false, error: err.message});
            }
            //retry {MAX_RETRIES} times if failed
            makeTransaction(data, count + 1);
        })
}

//log to log.xlsx
function log(data, result){
    let wb
    ,   fileName = 'log.xlsx'
    ,   sheet
    ,   range = {s: {c: 0, r: 0}, e: {c: 0, r: 0}};

    if(fs.existsSync(fileName)){
        wb = XLSX.readFile(fileName,{
            dateNF : 'dd/mmm/yyyy h:mm:ss'
        });

        sheet = result['status'] == true ? wb.Sheets['Succeed'] : wb.Sheets['Failed'];

        try{
            range = XLSX.utils.decode_range(sheet['!ref']);
        }
        catch(err){
            range = {s: {c: 0, r: 0}, e: {c: 0, r: 0}};
        }
    }
    else{
        wb = XLSX.utils.book_new();
        wb.SheetNames = ['Succeed','Failed'];
        sheet = result['status'] == true ? wb.Sheets['Succeed'] : wb.Sheets['Failed'] = {};
    }

    //build new json to append to existing json
    var ext_columns = {
        Status: result['status'], 
        Transaction_hash: result['transactionHash'], 
        Transaction_time: moment().format('DD/MMM/YYYY hh:mm:ss'), 
        Error: result['error']
    };

    //merge Jsons and convert to Array: {a: 1} + {b: 2} = [{a: 1, b: 2}]
    var merged = new Array(Object.assign(data, ext_columns));

    //add the result json to sheet, setting headers and origin start point depending on sheet's empty or not
    XLSX.utils.sheet_add_json(sheet, merged, {
        origin: Object.keys(sheet).length > 0 ? {c: range.s.c, r: range.e.r + 1} : {c: range.s.c, r: range.e.r},
        skipHeader: Object.keys(sheet).length > 0 ? true : false
    });
    
    XLSX.writeFile(wb, fileName);
}

//cron pattern that fires every {interval} minutes
var pattern = '*/'+intervals +' * * * *';
var job = new Job({
    cronTime: pattern,

    onTick: function() {
        console.log('\x1b[36m%s\x1b[0m', 'Scanning ' + inputFile + ' at ' + moment().format('DD/MMM/YYYY hh:mm:ss'));
        execute(inputFile);
    },

    runOnInit: true
});
