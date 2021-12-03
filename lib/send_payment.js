const { Asset, Operation, TransactionBuilder, BASE_FEE, Memo } = require('stellar-sdk')

exports.sendPayment = async function sendPayment (config, asset, from, to, amount, memoMsg) {
  const { server, txnOpts } = config
  const basePaymentOpts = {
    asset,
    amount: amount.toString()
  }
  const destination = to.publicKey()
  const memoText = memoMsg && Memo.text(memoMsg)

  try {
    const [source, fee, timebounds] = await Promise.all([
      server.loadAccount(from.publicKey()),
      txnOpts.fee || server.fetchBaseFee(),
      server.fetchTimebounds(100)
    ])

    const transactionOpts = { ...txnOpts, fee, timebounds }
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
      txn: result
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
