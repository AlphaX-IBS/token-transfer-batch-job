/**
 * This app scan input exel file for the EXECUTE_ON column (date) every 15 mins
 * If the record date time is within 15 mins from now, then get that record into cron job to execute that record at that exact date time
 * We can real-time edit the input exel file (add rows) without having to exit app
 * The output of this app should be an exel file (with rows correspond to input file) and highlight failed transactions
 * Only ONE instance of this app should be run at a time
 */

//libraries
var XLSX = require('xlsx');
var moment = require('moment');
var Job = require('cron').CronJob;;
var Web3 = require('web3');
var Tx = require('ethereumjs-tx');
var web3 = new Web3('ws://127.0.0.1:8545');

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
                //makeTransaction(json[i]);
                console.log('Making transaction at ' + moment().format('DD/MMM/YYYY hh:mm:ss'));
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
            console.log(receipt);
            /**
             * TODO: handle logging successful transaction here
             */
        })
        .catch(err=>{
            if(count == MAX_RETRIES){
                console.log(err);
                throw 'Maximum tries reached for ' + sender
                /**
                 * TODO: handle logging error here
                 */
            }
            makeTransaction(data, nonce + 1);
        })

}

//cron pattern that fires every {interval} minutes
var pattern = '*/'+intervals +' * * * *';
var job = new Job({
    cronTime: pattern,

    onTick: function() {
        console.log('Scanning ' + inputFile + ' at ' + moment().format('DD/MMM/YYYY hh:mm:ss'));
        execute(inputFile);
    },

    runOnInit: true
});
