// global.WebSocket = require('ws');
const WebSocket = require('ws');
const MTProto = require('@mtproto/core');
const prompts = require('prompts');
const path = require('path')
const token = "pIyM3RNd4ofXxQg";
const app_id = 32249;
const expected_payout = 19;

const api_id = 15742091;
const api_hash = 'b67618981a00965e472da6debb0355a8';

if (!token) {
    console.error('DERIV_TOKEN environment variable is not set');
    process.exit(1);
}

var selfSocket = null;
var amount = 1;

var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=' + app_id);;

ws.onclose = function (evt) {
    console.log('disconnect')
}


ws.onopen = function(evt) {
    selfSocket = ws;
    ws.send(JSON.stringify({ "authorize": token })) 
    console.log('[+] connected')
    setInterval(ping, 10000)
}

ws.onmessage = function(msg){
    var data = JSON.parse(msg.data);
    if (data.error !== undefined) {
        console.log(data.error.message);
        // ws.close();
    } else if (data.msg_type == 'authorize') {
        console.log('connected')
    } else if (data.msg_type == 'buy') {
        console.log("Contract Id " + data.buy.contract_id + "\n");
        console.log("Details " + data.buy.longcode + "\n");
    } else if (data.msg_type == 'proposal_open_contract') {
        var isSold = data.proposal_open_contract.is_sold;
        if (isSold) {
            console.log("Contract " + data.proposal_open_contract.status + "\n");
            console.log("Profit " + data.proposal_open_contract.profit + "\n");
            if(data.proposal_open_contract.status !== "won"){
                amount = amount * 2.5
            }else{
                amount = 1
            }
        } else {
            var currentSpot = data.proposal_open_contract.current_spot;
            var entrySpot = 0;
            if (typeof (data.proposal_open_contract.entry_tick) != 'undefined') {
                entrySpot = data.proposal_open_contract.entry_tick;
            }
            console.log("Entry spot " + entrySpot + "\n");
            console.log("Current spot " + currentSpot + "\n");
            console.log("Difference " + (currentSpot - entrySpot) + "\n");
        }
    }
}

async function getPhone() {
    return (await prompts({
        type: 'text',
        name: 'phone',
        message: 'Enter your phone number:'
    })).phone
}

async function getCode() {
    return (await prompts({
        type: 'text',
        name: 'code',
        message: 'Enter the code sent:',
    })).code
}

async function getPassword() {
    return (await prompts({
        type: 'text',
        name: 'password',
        message: 'Enter Password:',
    })).password
}


const mtproto = new MTProto({
    api_id,
    api_hash,
    storageOptions: {
        path: path.resolve(__dirname, './data/1.json'),
    },
});

function startListener() {
    console.log('[+] starting listener')
    
    mtproto.updates.on('updates', async ({ updates }) => {
        
        const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object
        
        for (const message of newChannelMessages) {
            console.log('message.peer_id.channel_id: ', message.peer_id.channel_id);
            if(message.peer_id.channel_id === "1647181836" || message.peer_id.channel_id === "1142631184"){
            
                let messages = message.message.split("\n")

                console.log(messages)
                
                if(messages.length === 2 || messages.length === 3){
                    let pair = messages[0]
                    let trade = []
                    if(messages.length === 3){
                        trade = messages[2].split(" ")
                    }else{
                        trade = messages[1].split(" ")
                    }

                    if(trade.length === 3){
                        let type = trade[0]
                        console.log({pair: "frx"+pair.replace("/", ""), type: type})
                        selfSocket.send(JSON.stringify({
                            "buy": 1,
                            "subscribe": 1,
                            "price": amount.toFixed(2),
                            "parameters": { 
                                "amount": amount.toFixed(2), 
                                "basis": "stake", 
                                "contract_type": type === "Buy" ? "CALL" : "PUT",
                                "currency": "USD", 
                                "duration": 3, 
                                "duration_unit": "m", 
                                "symbol": "frxEURUSD"
                            }
                        }))
                    }
                    
                }

            }
        }
    });
}

function ping() { ws.send(JSON.stringify({ "ping": 1 })) }

// mtproto.call('auth.logOut').then(res => console.log(res)).catch(err => console.log(err))



mtproto
    .call('users.getFullUser', {
        id: {
            _: 'inputUserSelf',
        },
    })
    .then(startListener)
    .catch(async error => {
        console.log('[+] You must log in')
        const phone_number = await getPhone()

        mtproto.call('auth.sendCode', {
            phone_number: phone_number,
            settings: {
                _: 'codeSettings',
            },
        })
            .catch(error => {
                if (error.error_message.includes('_MIGRATE_')) {
                    const [type, nextDcId] = error.error_message.split('_MIGRATE_');

                    mtproto.setDefaultDc(+nextDcId);

                    return sendCode(phone_number);
                }
            })
            .then(async result => {
                return mtproto.call('auth.signIn', {
                    phone_code: await getCode(),
                    phone_number: phone_number,
                    phone_code_hash: result.phone_code_hash,
                });
            })
            .catch(error => {
                if (error.error_message === 'SESSION_PASSWORD_NEEDED') {

                }
            })
            .then(result => {
                console.log('[+] successfully authenticated');
                startListener()
            });
    })