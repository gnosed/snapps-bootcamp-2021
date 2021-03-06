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

// TODO: connect the snapp to the frontend
export { deploy, submitBidTx, stopAuctionTx }

await isReady;

class BlindAuction extends SmartContract {
  @state(Bool) auctionDone: State<Bool>;
  @state(Field) highestBid: State<Field>;
  @state(PublicKey) highestBidder: State<PublicKey>;

  bidders: PublicKey[];
  bids: Field[];
  maxNumberOfBids: number;

  // Initialization
  constructor(
    initialBalance: UInt64,
    address: PublicKey,
  ) {
    super(address);
    this.balance.addInPlace(initialBalance);
    this.auctionDone = State.init(new Bool(false))
    this.highestBid = State.init(Field.zero)
    this.highestBidder = State.init(address)

    // Set the public key of the bidders
    this.bidders = [];
    this.bids = [];
    // In a real world app, the number of max allowed accounts will be much larger
    this.maxNumberOfBids = 10; // arbirtrary but this is the length of Local.testAccounts array
  }

  @method async submitBid(pubkey: PublicKey, signature: Signature, bid: Field) {
    // Checks if bids can still be sent
    const auctionDone = await this.auctionDone.get();
    auctionDone.assertEquals(false)

    // Ensures that the bidder owns the associated private key
    signature.verify(pubkey, [bid]).assertEquals(true)
    this.bidders.push(pubkey);
    this.bids.push(bid);

    const updatedAuctionDone = Circuit.if(new Bool(this.bidders.length == this.maxNumberOfBids), new Bool(true), new Bool(false))
    this.auctionDone.set(updatedAuctionDone)

    if (this.bidders.length == this.maxNumberOfBids)
      this.stopAuction()

    // Debug 
    console.log("bid: ", bid.toString())
    console.log("bidder's pubkey: ", pubkey.toJSON())
  }
  // Manually stop the auction and updates the final state; in production context, we can get a end timestamp from Mina to stop the auction
  @method stopAuction() {
    const bidsToNumber = this.bids.map((i) => parseInt(i.toString()))
    const indexOfHighestBid = getIndexOfMaxValue(bidsToNumber)

    const highestBid = this.bids[indexOfHighestBid];
    const highestBidder = this.bidders[indexOfHighestBid]

    this.auctionDone.set(new Bool(true))
    this.highestBid.set(highestBid)
    this.highestBidder.set(highestBidder)
  }
}

// Setup local Mina instance
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

  // Print snapp's initial state
  let b = await Mina.getAccount(snappPubkey);
  for (const i in [0, 1, 2, 3, 4, 5, 6, 7]) {
    console.log('state', i, ':', b.snapp.appState[i].toString());
  }

  // bid
  console.log('\n\n====== FIRST BID ======\n\n');
  await submitBidTx(player1, 100)

  // bid
  console.log('\n\n====== SECOND BID ======\n\n');
  await submitBidTx(player2, 99)

  // bid
  console.log('\n\n====== THIRD BID ======\n\n');
  await submitBidTx(player3, 22)

  // stop auction
  console.log('\n\n====== STOP AUCTION ======\n\n');
  await stopAuctionTx(player3)

  isDeploying = false
}

async function submitBidTx(privkey: PrivateKey, bid: number) {
  let tx =
    await Mina.transaction(privkey, async () => {
      const signature = Signature.create(privkey, [new Field(bid)]);
      await snappInstance.submitBid(
        privkey.toPublicKey(),
        signature,
        new Field(bid),
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

async function stopAuctionTx(privkey: PrivateKey) {
  console.log('Exec stopAuctionTx()')
  let tx =
    await Mina.transaction(privkey, async () => {
      await snappInstance.stopAuction();
    });
  try {
    await tx
      .send()
      .wait();
  } catch {
    console.log(`Stop auction failed.`)
  }

  console.log('\n\n====== FINAL SNAPP STATE ======\n\n');
  let b = await Mina.getAccount(snappPubkey);
  for (const i in [0, 1, 2, 3, 4, 5, 6, 7]) {
    console.log('state', i, ':', b.snapp.appState[i].toString());
  }

  console.log('\n\n====== AUCTION RESULTS ======\n\n');
  console.log('Winner\' pubkey: ', b.snapp.appState[2].toString())
  console.log('Paid price (highest bid): ', b.snapp.appState[1].toString())
}

// helpers
function getIndexOfMaxValue(array: number[]): number {
  const max = Math.max(...array);
  const index = array.indexOf(max);

  return index
}

// exec code
deploy();

// cleanup
shutdown();