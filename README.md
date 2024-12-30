# nfc-reader_js
FeliCa規格の非接触ICカードのIDmを読み取る<br>
 Read IDm from FeliCa(NFC Type-F).

## 開発仕様
+ Google Chrome (x64, 131.0.6778.205)
+ JavaScript

## 注意事項
+ [SONY RC-S380](https://www.sony.co.jp/Products/felica/consumer/products/RC-S380.html) を前提に作成しています
+ [SONY RC-S300](https://www.sony.co.jp/Products/felica/consumer/products/RC-S300.html) などの他ICカードリーダの動作保証はありません
+ [Zadig](https://zadig.akeo.ie/) などで WinUSBドライバ の割り当てが必要です

## サンプル
 [FeliCa読み込みテスト](https://limopika32.github.io/felica-reader/)

# やりとりあれこれ
最初に WinUSBドライバ が割り当たった SONY RC-S380 をブラウザで接続する。<br>
リーダとのやりとりの前提として パケット + コマンド のセットで通信を行うこと。<br>

どちらかというと低水準なアプローチなのか？教えて偉い人<br>
値を書く毎に `0xab` とやるのはめんどいので値に値する(~~くそさむ~~) 箇所は `ab`h で表記する。

## パケット について
パケットの構成は下記の通り
|Offset|Value|概要|
|-|-|-|
|0x00|`00`h|固定、パケットヘッダ|
|0x01|`00`h|〃|
|0x02|`ff`h|〃|
|0x03|`ff`h|〃|
|0x04|`ff`h|〃|
|0x05|-|パケットコマンドサイズ下位|
|0x06|-|パケットコマンドサイズ上位|
|0x07|-|パケットチェックサム|
|0x08|...|コマンド ...|

## コマンド について
コマンドの構成は下記の通り
### Prefix
|Offset|Value|概要|
|-|-|-|
|0x00|`d6`h|固定、コマンドヘッダ|
|0x01|-|コマンドタイプ|
|0x02|...|コマンドデータ ...|
### Suffix
|Offset|Value|概要|
|-|-|-|
|0x00|...|... コマンドデータ|
|0x01|-|コマンドチェックサム下位|
|0x02|`00`h|コマンドチェックサム上位<br>(ただし$\mod 256$ なので必然的に `00`h)|

例としてIDmを取得する、いわゆる polling を行うときのコマンドは下記の通りとなる

|Offset|Value|概要|
|-|-|-|
|0x00|`d6`h|固定、コマンドヘッダ|
|0x01|`04`h|RF Communicate|
|0x02|`6e`h|おそらく固定、データヘッダ|
|0x03|`00`h|〃|
|0x04|`06`h|* データ長<br>(\*部=コマンドチェックサムまでの長さ)|
|0x05|`00`h|* コマンドコード<br>Polling|
|0x06|`ff`h|* システムコード上位|
|0x07|`ff`h|* システムコード下位|
|0x08|`01`h|* リクエストコード|
|0x09|`0f`h|* タイムスロット|
|0x0a|`a4`h|コマンドチェックサム下位|
|0x0b|`00`h|コマンドチェックサム上位<br>(ただし$\mod 256$ なので必然的に `00`h)|

システムコードは、例えば学生証など、特定のカードのみ応答させることも出来る。{`ff`h, `ff`h} を指定すると、いわゆるワイルドカードの役割をもつ。

学生証などを読むときで本腰であろう、 ReadWithoutEncryption を行う際のコマンドは下記の通り

|Offset|Value|概要|
|-|-|-|
|0x00|`d6`h|固定、コマンドヘッダ|
|0x01|`04`h|RF Communicate|
|0x02|`6e`h|おそらく固定、データヘッダ|
|0x03|`00`h|〃|
|0x04|`--`h|* データ長<br>(\*部=コマンドチェックサムまでの長さ)|
|0x05|`06`h|* Read without encryption|
|0x06|-|* IDm 最上位バイト|
|...|...|*　... (8 byte)|
|0x0d|-|* IDm 最下位バイト|
|0x0e|`01`h|* サービス数<br>(複数指定可、2バイトずつ連続)|
|0x0f|-|* \| サービスコード下位|
|0x10|-|* \| サービスコード上位|
|0x11|`01`h|* ブロック数<br>(複数指定可、2バイトずつ連続)|
|0x12|`80`h|* \| ブロックエレメント上位バイト|
|0x13|`00`h|* \| ブロック番号<br>(複数時はインクリメント)|
|0x14|-|コマンドチェックサム下位|
|0x15|`00`h|コマンドチェックサム上位<br>(ただし$\mod 256$ なので必然的に `00`h)|

## ざっくり
FeliCa からメインとなるデータを得るための Read without encryption をやるには、カードを特定するIDmが必要になるので

1. 》 おまいら！システムコードに反応できるIDm教えてくんろ！(Polling)
    - 《 俺行けるわ！俺のIDmこれやでー (IDmが返される)
1. 》 あざすざす！ほんなら○○のデータもらいたいんやけど... (ReadWithoutEncryption)
    - 《 了解した、これこれこれやでー (もろもろデータget)

要はこういうことをやってるわけですね。(やけくそ)

## チェックサム
パケットチェックサム、コマンドチェックサム共に共通して以下の通り
$$(256-\sum(cmd))\mod 256$$
パケットチェックサム は コマンドサイズ の部分を、<br>コマンドチェックサム は コマンドヘッダ から コマンドチェックサムを含まない部分 を $cmd$ へ適用する。

## 参考
+ [FeliCaカード ユーザーズマニュアル 抜粋版](https://www.sony.co.jp/Products/felica/business/tech-support/st_usmnl.html)
+ [WebUSBことはじめ](https://qiita.com/Aruneko/items/aebb75feca5bed12fe32)
+ [WebUSBでFeliCaの一意なIDであるIDmを読む](https://qiita.com/saturday06/items/333fcdf5b3b8030c9b05)

## ライセンス(LICENSE)
このリポジトリは [MITライセンス](./LICENSE) に準拠しています。<br>
Released under the [MIT license](./LICENSE).