/**
 * define variables (connections, inputFile, contract addr...)
 * `node airdrop insert` to insert all rows from airdrop.exlx (inputFile var) to mysql database
 * `node airdrop` to read 100 rows from mysql table and start contract function (transfer)
 * log results to airdrop_log.xlsx
 */


//libraries
var fs = require('fs');
var XLSX = require('xlsx');
var moment = require('moment');
var Job = require('cron').CronJob;;
var Web3 = require('web3');
var Tx = require('ethereumjs-tx');
var mysql = require('mysql');
//var ethereum_address = require('ethereum-address');
var web3 = new Web3('wss://ropsten.infura.io/_ws'); //set the host here
//ws://ropsten.infura.io/ws
//ws://127.0.0.1:8545
//ws://150.95.149.2:8546

//contract config (testnet)
//https://github.com/AlphaX-IBS/airdrop-contract/blob/develop/truffle/contracts/gex-alloc.sol
//ROPSTEN
//using gex contract address: 0x11a15c863100b00b1ad7256ee1f9017b30e0ce8a
//deployed gex-alloc contract address: 0x72f666d014221aba42c645f13756637857823fd7
var contractAbi = [{constant:!0,inputs:[],name:"gexOwner",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{constant:!0,inputs:[],name:"gexAdmin",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{constant:!0,inputs:[],name:"gex",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{inputs:[{name:"_contractAddress",type:"address"}],payable:!1,stateMutability:"nonpayable",type:"constructor"},{constant:!1,inputs:[{name:"_toAddress",type:"address[]"},{name:"_tokenAmount",type:"uint256[]"}],name:"batchReservedTokenAlloc",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"},{constant:!1,inputs:[{name:"_to",type:"address[]"},{name:"_amount",type:"uint256[]"}],name:"batchTokenTransfer",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"},{constant:!1,inputs:[{name:"_to",type:"address"},{name:"_amount",type:"uint256"}],name:"tokenTransfer",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"}];
var contractAddress = '0x72f666d014221aba42c645f13756637857823fd7';
var sender = '0x36d2dbbf82cc5b6ce89a3001d87c1cdab7f34b0a'; //the address that call the contract
var privateKey = new Buffer.from('E3D12B70D5BED0852CF3C179F7F31F49B91B480E58D9619C4BF10429B18B895B', 'hex'); //private key of sender
/**----------------------------------- */

//mysql database config
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'airdrop'
});
var table = 'airdrop_addresses'; //3 columns: to_address, gex, status
var limit = 20; //transactions per run, too high will exceeds gas limit
var gasLimit = 400000;
var gasPrice = 2; //gwei
/**----------------------------------- */

//variables
var inputFile = 'airdrop.xlsx';

var intervals = 15; //minutes between each run, must be integer
/**----------------------------------- */

/*specify column headers names (case sensitive)*/
var COL_NAMES = {
    "TO_ADDRESS" : "to_address",
    "GEX" : "gex",
    "STATUS": "status",
    "VALID": "valid"
}
/*--------------------*/

//main functions
//check arguments passed into this
const args = process.argv;
//`node airdrop insert`: scan input exel and insert to mysql
if(args[2] == 'insert'){
    var workbook = XLSX.readFile(inputFile,{
        dateNF : 'dd/mmm/yyyy h:mm:ss'
    });

    //we assume data are stored in first sheet
    var sheet = workbook.Sheets[workbook.SheetNames[0]];

    //convert to json to read
    var json = XLSX.utils.sheet_to_json(sheet);

    //get column and row numbers
    var rows = Object.keys(json).length;

    connection.connect(err => {
        if(err) console.log(err);
    });
    //loop through data to insert into table
    for(let i=0; i < rows; ++i){
        //console.log('insert into ' + table + ' select "' + json[i][COL_NAMES.TO_ADDRESS] + '", ' + json[i][COL_NAMES.ETH] + ', false' + ' from dual');
        connection.query('insert into ' + table + ' select "' + json[i][COL_NAMES.TO_ADDRESS] + '", ' + json[i][COL_NAMES.GEX] + ', false, true from dual', (err, result, fields) => {
            if(err) throw err;
        })
    }

    connection.end(err => {
        if(err) console.log(err);
    });

    console.log("Complete inserting!");
}
//`node airdrop.js`, select top 100 from table and make contract calls
else if (args[2] == 'validate') {
    var invalid_addresses = [];

    // var check = web3.utils.isAddresss("0x96504844D3D5aC854D9E137dF614e680cafdcf66".toUpperCase());
    //var check = web3.utils.isAddress('0x96504844D3D5aC854D9E137dF614e680cafdcf66');

    connection.connect(err => {
        if(err) console.log(err);
    });

    connection.query('select '+COL_NAMES.TO_ADDRESS+' from ' + table, (err, results, field) => {
        if(err) throw err;

        // build array of valid eth address
        // https://web3js.readthedocs.io/en/1.0/web3-utils.html#isaddress
        // Uppercase whole address string to avoid checksum
        for (i = 0; i < results.length; i++) {
            // if (ethereum_address.isAddress(results[i][COL_NAMES.TO_ADDRESS]) == false) {
            var upperAddress = results[i][COL_NAMES.TO_ADDRESS].toString().toUpperCase();
            if (web3.utils.isAddress(upperAddress) == false) {
                invalid_addresses.push(results[i][COL_NAMES.TO_ADDRESS]);
            }
        }
    });

    if(invalid_addresses.length > 0){
        connection.query("UPDATE " + table + " SET "+COL_NAMES.VALID+" = false WHERE "+COL_NAMES.TO_ADDRESS+" in (?) ", [invalid_addresses], (err, results, field) => {
            if (err) throw err;
        });

        connection.end(err => {
            if(err) console.log(err);
            console.log("Completed validation! invalids found: " + invalid_addresses.length);
        });
    }
    else{
        connection.end(err => {
            if(err) console.log(err);
            console.log("Completed validation! No invalids found");
        });
    }
}
else if (!args[2]) {
    connection.connect(err => {
        if(err) console.log(err);
    });

    var contract = new web3.eth.Contract(contractAbi, contractAddress);

    connection.query('select * from ' + table + ' where '+COL_NAMES.STATUS+' = false and '+COL_NAMES.VALID+' = true limit ' + limit, (err, results, field) => {
        if(err) throw err;

        //build array to pass to contract
        var addresses = [], values = [];
        for (i = 0; i < results.length; i++){
            addresses.push(results[i][COL_NAMES.TO_ADDRESS]);
            values.push(results[i][COL_NAMES.GEX]); //convert to big number to pass into contract
        }

        //call batchTokenTransfer from contract, note that the contract must have enough gex balance first (call allocateToken from gex to this contract)
        //call using sendSignedTransaction method, infura doesnt support other methods
        web3.eth.getTransactionCount(sender).then(nonce => {
            sendTransaction(nonce, addresses, values);
        })
    })
    
    //cron pattern that fires every {interval} minutes
    // var pattern = '*/'+intervals +' * * * *';
    // var job = new Job({
    //     cronTime: pattern,
    
    //     onTick: function() {
    //         console.log('\x1b[36m%s\x1b[0m', 'Scanning ' + inputFile + ' at ' + moment().format('DD/MMM/YYYY hh:mm:ss'));
    //         execute(inputFile);
    //     },
    
    //     runOnInit: true
    // });
}

function sendTransaction(nonce, addresses, values){
    var rawTx = {
        nonce: nonce,
        from: sender,
        to: contractAddress,
        //gasPrice: web3.utils.toHex(web3.eth.getGasPrice()),
        gasPrice: web3.utils.toHex(web3.utils.toWei(gasPrice.toString(),'gwei')), //manually set gas price to 2gwei
        gasLimit: web3.utils.toHex(gasLimit),
        data: contract.methods.batchTokenTransfer(addresses, values).encodeABI()
    }
      
    var tx = new Tx(rawTx);
    tx.sign(privateKey);
      
    var serializedTx = tx.serialize();
    web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
    .on('transactionHash', hash => {
        console.log('----------');
        console.log('transaction hash: ' + hash);
        console.log('----------');
    })
    .on('receipt', (receipt) => {
        log({addr: addresses, val: values}, receipt);
        console.log('----------');
        console.log('transaction mined!');
        console.log('----------');
        /**
         * TODO: somehow catch all successful transactions and update table status to true
         */
    })
    .on('error', (err, receipt) => {
        // if(nonce < 100){
        //     sendTransaction(nonce + 1, addresses, values);
        // }
        log({addr: addresses, val: values}, receipt ? receipt : {status: false, error: JSON.stringify(err)});
        console.log('----------');
        console.log('\x1b[41m%s\x1b[0m','An error occurred, please check log file, transaction time: '+ moment().format('DD/MMM/YYYY hh:mm:ss'));
        console.log(err);
        console.log('----------');
    })
}

//log to log file
function log(data, result){
    let wb
    ,   fileName = 'airdrop_log.xlsx'
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
