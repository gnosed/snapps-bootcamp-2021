import {
  matrixProp,
  CircuitValue,
  Field,
  SmartContract,
  PublicKey,
  method,
  PrivateKey,
  Mina,
  Bool,
  state,
  State,
  isReady,
  Poseidon,
  UInt64,
  Party,
  Int64,
  Signature,
  Circuit,
  shutdown
} from 'snarkyjs';

export { deploy, submitBidTx }

await isReady;

class BlindAuction extends SmartContract {
  @state(Bool) auctionDone: State<Bool>;
  @state(Field) highestBid: State<Field>;
  @state(PublicKey) highestBidder: State<PublicKey>;

  bidders: PublicKey[];
  bids: Field[];
  maxNumberOfBids: number;

  // initialization
  constructor(
    initialBalance: UInt64,
    address: PublicKey,
  ) {
    super(address);
    this.balance.addInPlace(initialBalance);
    this.auctionDone = State.init(new Bool(false))
    this.highestBid = State.init(Field.zero)
    this.highestBidder = State.init(address)
    // set the public key of the bidders
    this.bidders = [];
    this.bids = [];
    this.maxNumberOfBids = 10; // length of local test accounts 
  }
  @method async submitBid(pubkey: PublicKey, signature: Signature, bid: Field) {
    // ehecks if bids can still be sent
    const auctionDone = await this.auctionDone.get();
    auctionDone.assertEquals(false)

    // ensures that the bidder owns the associated private key
    signature.verify(pubkey, [bid]).assertEquals(true)

    this.bidders.push(pubkey);
    this.bids.push(bid);

    // const bidderToString = this.bidders.map((i) => i.toString())

    // new Bool(bidderToString.includes(pubkey.toString())).assertEquals(false)

    // debug 
    console.log("submitBid()")
    console.log("auctionDone: ", auctionDone)
    console.log("bid: ", parseInt(bid.toString()))
    console.log("bidders: ", JSON.stringify(this.bidders))
    console.log("bids: ", JSON.stringify(this.bids))

    const updatedAuctionDone = Circuit.if(new Bool(this.bidders.length == this.maxNumberOfBids), new Bool(true), new Bool(false))
    this.auctionDone.set(updatedAuctionDone)

    if (this.bidders.length == this.maxNumberOfBids) {
      const bidsToNumber = this.bids.map((i) => parseInt(i.toString()))
      const indexOfHighestBid = getIndexOfMaxValue(bidsToNumber)

      const highestBid = this.bids[indexOfHighestBid];
      const highestBidder = this.bidders[indexOfHighestBid]

      this.highestBid.set(highestBid)
      this.highestBidder.set(highestBidder)
    }
  }
  @method stopAuction() {
    this.auctionDone.set(new Bool(true))
  }
}

function getIndexOfMaxValue(array: number[]): number {
  const max = Math.max(...array);
  const index = array.indexOf(max);

  return index
}


// setup local Mina instance
const Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);
let snappInstance: BlindAuction;
let snappPubkey: PublicKey;
let isDeploying = false;

const player1 = Local.testAccounts[0].privateKey;
const player2 = Local.testAccounts[1].privateKey;
const player3 = Local.testAccounts[2].privateKey;

async function deploy() {
  if (isDeploying) return;
  isDeploying = true

  const snappPrivkey = PrivateKey.random();
  snappPubkey = snappPrivkey.toPublicKey();

  // Create a new instance of the contract
  console.log('\n\n====== DEPLOY SNAPP ======\n\n');
  await Mina.transaction(player1, async () => {
    // player2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(1000000000);
    const p = await Party.createSigned(player2);
    p.body.delta = Int64.fromUnsigned(amount).neg();

    snappInstance = new BlindAuction(
      amount,
      snappPubkey,
    );
  })
    .send()
    .wait();

  // initial state
  let b = await Mina.getAccount(snappPubkey);
  console.log('initial state of the snapp');
  for (const i in [0, 1, 2, 3, 4, 5, 6, 7]) {
    console.log('state', i, ':', b.snapp.appState[i].toString());
  }

  // play
  console.log('\n\n====== FIRST BID ======\n\n');
  await Mina.transaction(player1, async () => {
    const bid = new Field(10);
    const signature = Signature.create(player1, [bid]);
    await snappInstance.submitBid(
      player1.toPublicKey(),
      signature,
      bid,
    );
  })
    .send()
    .wait();
  await submitBidTx(player1, new Field(33))

  // debug
  b = await Mina.getAccount(snappPubkey);
  for (const i in [0, 1, 2, 3, 4, 5, 6, 7]) {
    console.log('state', i, ':', b.snapp.appState[i].toString());
  }

  // play
  console.log('\n\n====== SECOND BID ======\n\n');
  await Mina.transaction(player2, async () => {
    const bid = new Field(2);
    const signature = Signature.create(player2, [bid]);
    await snappInstance
      .submitBid(player2.toPublicKey(), signature, bid)
      .catch((e) => console.log(e));
  })
    .send()
    .wait();

  b = await Mina.getAccount(snappPubkey);

  // play
  console.log('\n\n====== THIRD BID ======\n\n');
  await Mina.transaction(player3, async () => {
    const bid = new Field(22);
    const signature = Signature.create(player3, [bid]);
    await snappInstance
      .submitBid(player3.toPublicKey(), signature, bid)
      .catch((e) => console.log(e));
  })
    .send()
    .wait();

  b = await Mina.getAccount(snappPubkey);

  console.log('did someone win?', b.snapp.appState[2].toString());
  for (const i in [0, 1, 2, 3, 4, 5, 6, 7]) {
    console.log('state', i, ':', b.snapp.appState[i].toString());
  }
  isDeploying = false
}

async function submitBidTx(privkey: PrivateKey, bid: Field) {
  let tx =
    await Mina.transaction(privkey, async () => {
      const signature = Signature.create(privkey, [bid]);
      await snappInstance.submitBid(
        privkey.toPublicKey(),
        signature,
        bid,
      );
    });
  try {
    await tx
      .send()
      .wait();
  } catch {
    console.log(`Send bid ${bid.toString()} from privkey ${privkey.toString()} failed.`)
  }
}

deploy();
if (!isDeploying) {
  await submitBidTx(player1, new Field(33))
  await submitBidTx(player2, new Field(44))
  await submitBidTx(player3, new Field(55))
}

// Cleanup
shutdown();