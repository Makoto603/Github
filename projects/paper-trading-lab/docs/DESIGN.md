# Architecture

Market Data -> Strategy -> Risk Guard -> Paper Broker(SQLite) -> Dashboard
                                      -> Nightly LLM -> Candidate only

## System constitution
LLMから変更不可: initial capital / max symbol weight / max positions / max drawdown / fee / slippage / paper-only architecture.

## Evaluation
勝率ではなく Total Return, Expectancy, Profit Factor, Max Drawdown を主指標にする。