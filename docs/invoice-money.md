# Invoice money tools

No KidEase subscription and no in-app purchase. Parents stay in the free founding period.

| Flag | Default | What it does |
| --- | --- | --- |
| `FEATURE_SAVED_PAYMENTS` | off | Stores a Stripe payment method id, brand, and last 4. Never a card number. |
| `FEATURE_AUTOPAY` | off | Records parent consent to pay a daycare invoice. This change does not create a Stripe charge. |
| `FEATURE_INSTALMENTS` | off | Splits an invoice into 2, 3, or 4 equal parts. No interest. The last part takes the leftover cents. |
| `FEATURE_FEE_ESTIMATOR` | off | Adds a subsidy and tax-credit line on the existing calculator. The parent types the centre's posted fee. The result is an estimate, not a bill. |

Set `VITE_FEATURE_FEE_ESTIMATOR=1` as well for the calculator line, because that component reads the client flag.

## GHL

Do not store card ids or invoice amounts in GoHighLevel.
