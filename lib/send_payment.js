const { Asset, Operation, TransactionBuilder, BASE_FEE, Memo } = require('stellar-sdk')

exports.sendPayment = async function sendPayment (server, networkPassphrase, asset, from, to, amount, memoMsg) {
  const basePaymentOpts = {
    asset,
    amount: amount.toString()
  }
  const memoText = memoMsg && Memo.text(memoMsg)

  try {
    const [source, fee, timebounds] = await Promise.all([
      server.loadAccount(from.publicKey()),
      server.fetchBaseFee(),
      server.fetchTimebounds(100)
    ])
    const transactionOpts = {
      fee,
      networkPassphrase,
      timebounds
    }
    const destination = to.publicKey()
    const payment = Operation.payment({ ...basePaymentOpts, destination })

    let txn = new TransactionBuilder(source, transactionOpts)
    txn.addOperation(payment)
    if (memoText) {
      txn.addMemo(memoText)
    }
    txn = txn.build()
    txn.sign(from)

    const result = await server.submitTransaction(txn, { skipMemoRequiredCheck: true })

    return {
      address: destination,
      success: true,
      tx_hash: result.hash
    }
  } catch (e) {
    return {
      address: destination,
      success: false,
      reason: e.message,
      errorData: e?.response?.data
    }
  }
}
