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
var mysql = require('mysql');
var web3 = new Web3('wss://ropsten.infura.io/ws'); //set the host here
//ws://127.0.0.1:8545

//contract config (testnet)
//https://github.com/AlphaX-IBS/airdrop-contract/blob/develop/truffle/contracts/gex-alloc.sol
//ROPSTEN
//using gex contract address: 0x55ccb6d52b3b53ae61bbead0a25d24b16b53c2be
//deployed gex-alloc contract address: 0x60979487730524274d3a611efac5049452d4b1ae
var contractAbi = [{constant:!0,inputs:[],name:"gexOwner",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{constant:!0,inputs:[],name:"gexAdmin",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{constant:!0,inputs:[],name:"gex",outputs:[{name:"",type:"address"}],payable:!1,stateMutability:"view",type:"function"},{inputs:[{name:"_contractAddress",type:"address"}],payable:!1,stateMutability:"nonpayable",type:"constructor"},{constant:!1,inputs:[{name:"_toAddress",type:"address[]"},{name:"_tokenAmount",type:"uint256[]"}],name:"batchReservedTokenAlloc",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"},{constant:!1,inputs:[{name:"_to",type:"address[]"},{name:"_amount",type:"uint256[]"}],name:"batchTokenTransfer",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"},{constant:!1,inputs:[{name:"_to",type:"address"},{name:"_amount",type:"uint256"}],name:"tokenTransfer",outputs:[],payable:!1,stateMutability:"nonpayable",type:"function"}];
var contractAddress = '0x60979487730524274d3a611efac5049452d4b1ae';
/**----------------------------------- */

//mysql database config
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'airdrop'
});
var table = 'airdrop_addresses'; //3 columns: to_address, gex, status
var limit = 100; //transactions per run
/**----------------------------------- */

//variables
var inputFile = 'airdrop.xlsx';

var intervals = 15; //minutes between each run, must be integer
/**----------------------------------- */

/*specify column headers names (case sensitive)*/
var COL_NAMES = {
    "TO_ADDRESS" : "to_address",
    "ETH" : "gex",
    "STATUS": "status"
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
        connection.query('insert into ' + table + ' select "' + json[i][COL_NAMES.TO_ADDRESS] + '", ' + json[i][COL_NAMES.ETH] + ', false' + ' from dual', (err, result, fields) => {
            if(err) throw err;
        })
    }

    connection.end(err => {
        if(err) console.log(err);
    });
}
//`node airdrop.js`, select top 100 from table and make contract calls
else if (!args[2]) {
    connection.connect(err => {
        if(err) console.log(err);
    });

    var contract = new web3.eth.Contract(contractAbi, contractAddress);

    connection.query('select * from ' + table + ' where status = false limit ' + limit, (err, results, field) => {
        if(err) throw err;

        //build array to pass to contract
        var addresses = [], values = [];
        for (i = 0; i < results.length; i++){
            addresses.push(results[i][COL_NAMES.TO_ADDRESS]);
            values.push(results[i][COL_NAMES.ETH]);
        }

        //doc: https://web3js.readthedocs.io/en/1.0/web3-eth-contract.html#id12
        //call batchTokenTransfer from contract, note that the contract must have enough gex balance first (call allocateToken from gex to this contract)
        contract.methods.batchTokenTransfer(addresses, values).send().
            on('transactionHash', hash => {
                var hash = hash;
                console.log('----------');
                console.log('transaction hash: ' + hash);
                console.log('----------');
            })
            on('receipt', (receipt) => {
                log({addr: addresses, val: values}, receipt);
                /**
                 * TODO: somehow catch all successful transactions and update table status to true
                 */
            })
            .on('error', err => {
                log({addr: addresses, val: values}, {status: false, error: err.message, transactionHash: hash});
                console.log('----------');
                console.log('\x1b[41m%s\x1b[0m','An error occurred, please check log file, transaction time: '+ moment().format('DD/MMM/YYYY hh:mm:ss'));
                console.log(err.message);
                console.log('----------');
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
