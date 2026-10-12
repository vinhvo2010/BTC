# SCM AutoTrader V1 Đặc tả thuật toán và kiến trúc

**Ngày chốt:** 12 tháng 10 năm 2026, múi giờ Asia/Ho_Chi_Minh. **Đối tượng:** nhóm phát triển, kiểm thử và vận hành bản nghiên cứu Skydeal. **Phạm vi:** mã nguồn trong thư mục SCMv3-Signal15 tại thời điểm đóng gói. V1 ở đây là phiên bản của bộ tài liệu và gói mã nguồn; tên phiên bản nội bộ của API là SCM15_RESEARCH_MULTIFRAME_V3, bộ nghiên cứu kế hoạch 15m là SCM15_RESEARCH_PLAN_V2 và bộ quan sát đa khung là SCM15_MULTIFRAME_RESEARCH_V1. Không đổi tên các thuật toán đó thành một mô hình đã được kiểm định mới.

## Kết luận và cách dùng tài liệu

Hệ thống hiện là website nghiên cứu SHADOW cho BTCUSDT và ENAUSDT perpetual USD M của Binance. Một lần gọi API đánh giá nến đã đóng ở sáu khung 15m, 1h, 4h, 1d, 1w và 1M. Trang hiển thị cấu trúc giá, vùng cung cầu dạng quan sát, khối lượng, bias Long Short và kịch bản chờ xác nhận. API luôn giữ tradePermission bằng NO_TRADE, executionEnabled bằng false và không tạo lệnh Paper hoặc lệnh thật. Điểm hướng và các tỷ lệ trên giao diện không phải xác suất thắng. Đây là hiện trạng mã nguồn, không phải tuyên bố hoàn thành toàn bộ SCMv3.

Đọc mục Nguồn và thời gian trước khi thay đổi quy tắc. Đọc mục Hợp đồng trạng thái trước khi nối thêm nguồn hoặc giao diện. Mỗi thay đổi có thể ảnh hưởng quyết định phải có model version mới, kiểm thử nến theo thời điểm và cohort đánh giá riêng. Không gỡ gate chỉ để tăng số tín hiệu.

## Ranh giới hệ thống

| Thành phần | Trách nhiệm hiện tại | Tệp nguồn |
|---|---|---|
| API nghiên cứu | Đọc Binance public và BTC.D, chốt receipt, xây đánh giá 12 khung, che kế hoạch chưa đủ rủi ro | api/live.js |
| Audit và đánh giá đa khung | Kiểm tra nến native, pivot nhân quả, volume, breakout, bias và trạng thái quan sát | lib/multiframe.js |
| Kế hoạch 15m cũ | Tạo ứng viên nghiên cứu có điều kiện và tính R:R với chi phí giả định | lib/engine.js |
| Vùng cung cầu quan sát | Khóa ATR tại origin, đếm retest, đánh dấu BROKEN, tính áp lực định tính | lib/zones.js |
| Giao diện | Chart nến đóng, vùng, mốc chờ, SCM Signal, bảng gate và lịch sử quan sát | index.html |
| Feed lịch sử công khai | Đọc receipt GitHub Actions đã công bố, gắn nhãn stale, không tạo lịch sử mới | api/feed.js |
| Chạy local và kiểm thử | HTTP local, one shot scan, smoke giao diện và regression | dev-server.js, scripts, tests |

Luồng hiện tại: trình duyệt gọi GET /api/live; Vercel function đọc đồng hồ và nến Binance cùng metadata hợp đồng, đọc BTC.D CoinGecko, audit từng receipt rồi trả JSON; trình duyệt dựng chart và trạng thái. GET /api/feed là luồng công khai khác, dùng để hiển thị receipt lịch sử best effort. Vercel function chạy theo yêu cầu, không phải bộ lập lịch mỗi nến và không có journal bền vững của chính site.

## Nguồn dữ liệu và ranh giới tin cậy

Binance Futures public REST cung cấp /fapi/v1/time, /fapi/v1/exchangeInfo và /fapi/v1/klines. Cặp được chấp nhận là BTCUSDT và ENAUSDT, hợp đồng PERPETUAL, quote và margin bằng USDT, trạng thái TRADING. Giá nến là LAST của USD M futures, khác mark và index. Các khung được lấy native, không dựng 1w hoặc 1M bằng cách cộng nến nhỏ. ENAUSDT 5m chỉ phục vụ kiểm tra retest sau setup 15m. API không đọc tài khoản, không dùng khóa, không đặt, sửa hoặc hủy lệnh.

Mỗi request Binance có thời gian nhận riêng. Host chính và host dự phòng đều là host Binance được khai báo trong api/live.js. HTTP 403, 429 hoặc 451 dừng request đó; mã không đổi proxy hoặc credential để vượt hạn chế. Lỗi nguồn được ghi ở sourceErrors và không trở thành số 0.

BTC.D là market cap percentage của BTC trong tập tài sản CoinGecko Global API. Giá trị có asOf và receivedAt; hợp lệ khi tuổi tại receipt từ 0 đến 15 phút. Với ENA, asOf và receivedAt phải không muộn hơn decisionAt. BTC.D không đo dòng tiền ròng và không được áp ngược cho quyết định lịch sử khi chưa có receipt tương ứng.

Volume trong nến futures là số lượng tài sản cơ sở. Taker buy, taker sell và delta chỉ mô tả giao dịch chủ động trong cùng cửa sổ, không chứng minh dòng tiền mua ròng, người mua cuối cùng hay vị thế của một nhóm nhà giao dịch. Spot và futures không được cộng chéo trong phiên bản này vì site chỉ có tập futures.

## Thời gian và kiểm toán nến

requestedAt được ghi sau khi xác nhận đồng hồ Binance. Mỗi nến có start và end; Binance close timestamp được chuyển thành end độc quyền bằng cách cộng 1 ms. decisionAt là thời điểm sau khi các lần đọc đã settle. Một nến chỉ được xét khi end không muộn hơn cutoff khung. Cutoff 15m, 1h, 4h và 1d lấy theo UTC; tuần bắt đầu thứ Hai UTC; tháng bắt đầu ngày 1 UTC. Nến đang mở bị loại và đếm ở openExcluded.

Audit kiểm tra schema, thời gian khung native, OHLC dương và nhất quán, volume không âm, taker buy từ 0 đến volume, nến cuối đúng cutoff, duplicate, gap và warm up. Ngưỡng warm up theo khung: 15m 230, 1h 110, 4h 110, 1d 80, 1w 50, 1M 30 nến. Lỗi cấu trúc hoặc duplicate tạo DATA_CONFLICT; gap tạo CLOSED_CANDLE_GAP; thiếu nến cuối hoặc warm up tạo lý do riêng. receivedAt trước requestedAt là INVALID_RECEIPT_CLOCK; receipt sau decisionAt là RECEIPT_AFTER_DECISION. Metadata hợp đồng chưa xác minh cũng làm audit không hợp lệ. Khi audit không VALID, đánh giá giữ DATA_INCOMPLETE; chỉ số, kịch bản và kế hoạch phụ thuộc phải null. Nến raw có thể vẫn xuất hiện riêng để phục vụ kiểm tra lỗi, không được dùng như tín hiệu xác nhận.

## Cấu trúc giá và đánh giá đa khung

Pivot high chỉ được xác nhận nếu high origin lớn hơn tất cả r nến trước và r nến sau; pivot low đối xứng. knownAt bằng end của nến thứ r bên phải. Pivot không thể dùng trước knownAt. Bán kính r bằng 2 cho 15m và 1M; bằng 3 cho 1h, 4h, 1d và 1w. Đây là cấu hình của site; không được trộn kết quả với model khác có bán kính khác.

Hai pivot high và hai pivot low đã xác nhận tạo cấu trúc: UP nếu cả hai cặp tăng, DOWN nếu cả hai cặp giảm, MIXED nếu không đồng thuận, UNKNOWN nếu thiếu cặp. Phá biên Long chỉ khi close của nến đã đóng mới nhất lớn hơn high tối đa của 20 nến trước. Phá biên Short chỉ khi close nhỏ hơn low tối thiểu của 20 nến trước. Nến chạm biên hoặc vượt bằng wick chưa xác nhận breakout.

Volume của khung là volume nến mới nhất. Taker sell bằng volume trừ taker buy; delta bằng taker buy trừ taker sell. RVOL bằng volume mới nhất chia trung bình volume của 20 nến đóng trước; baseline bằng 0 thì RVOL null. Tỷ lệ taker buy bằng 100 nhân taker buy chia volume nến, null nếu volume bằng 0. Các giá trị cùng khung và cùng thị trường futures.

Mỗi đánh giá đa khung có state DATA_INCOMPLETE nếu audit không VALID, WATCH nếu có breakout 20 nến đóng, ngược lại WAIT. WATCH chỉ là quan sát, kể cả khi RVOL thấp; lý do RVOL_BELOW_1_5_OR_MISSING được ghi. Các trường tradePermission, paperOrderCreated và executionEnabled lần lượt là NO_TRADE, false và false. Entry, stop, target, size, netRR và probability luôn null trong đánh giá đa khung. Scenarios chỉ là biên chờ Long trên prior20High và biên chờ Short dưới prior20Low, với biên bác bỏ đối diện; chúng không phải stop loss, target hay lệnh.

## Vùng cung cầu quan sát

observedZones chỉ xử lý nến đã đóng và pivot đã qua xác nhận bên phải. Vùng cung dùng body low của nến origin làm lower và high của nó làm upper. Vùng cầu dùng low làm lower và body high làm upper. Mỗi vùng lưu timeframe, loại, originAt, knownAt, formation, volume origin và ATR Wilder 14 khóa tại origin. Vùng không hợp lệ khi lower không thấp hơn upper.

Sau knownAt, một lần chạm xảy ra khi khoảng high low của nến cắt vùng; các nến chạm liên tục chỉ tính một retest. Close vượt qua cạnh xa của vùng cung hoặc dưới cạnh xa của vùng cầu chuyển trạng thái sang BROKEN và lưu breakAt. BROKEN là trạng thái cuối trong lần đánh giá; mã không đổi vùng cũ thành vùng flip mới.

Áp lực phá vùng chỉ là heuristic ba dấu hiệu: giá cách vùng không quá hai lần bề rộng vùng, ít nhất hai retest, và delta origin hướng phá với relative volume origin từ 1.5. Có 3 dấu hiệu là HIGH, 2 là MEDIUM, còn lại LOW. Trường probability luôn null. Dấu hiệu volume ở origin không chứng minh một bức tường lệnh bền hay khả năng khớp tại biên.

## Bias và điểm hướng trên giao diện

Mỗi khung có ba thành phần trọng số bằng nhau: cấu trúc pivot, breakout 20 nến đóng và taker buy share của nến cuối. UP hoặc breakout LONG cấp một phần Long; DOWN hoặc breakout SHORT cấp một phần Short; MIXED hoặc không có breakout cấp một phần trung lập. Thành phần taker buy chia theo tỷ lệ mua và bán. Nếu không có taker share thì thành phần đó trung lập. LongEvidencePct, shortEvidencePct và neutralEvidencePct cộng gần bằng 100 sau làm tròn. coveragePct là tỷ lệ thành phần có đủ chứng cứ. Nếu audit không VALID, tất cả phần trăm là null.

Leaning LONG hoặc SHORT đòi hỏi tỷ trọng hướng lớn hơn và có cấu trúc hoặc breakout cùng hướng. Nếu cấu trúc và breakout đối nghịch, leaning là MIXED; nếu chưa rõ là UNDETERMINED. Thẻ SCM Signal hiển thị điểm hướng bằng LongEvidencePct trừ ShortEvidencePct, trong khoảng âm 100 đến dương 100. Điểm, thanh bias và độ phủ là mô tả bằng chứng, không phải xác suất thắng, lợi nhuận kỳ vọng hay quyền vào lệnh. Thẻ cũng hiển thị cấu trúc D1 H4 H1, áp lực giao dịch cùng khung và BTC.D với thời điểm nguồn. Nếu audit lỗi, điểm chuyển thành null.

Bias tổng hợp sáu khung trong multiframe dùng trọng số cấu trúc 1, 2, 3, 4, 5, 6 theo thứ tự 15m đến 1M; chỉ UP và DOWN đã xác nhận vào tử số. Đây là phép tổng hợp khác bias từng khung. Bộ plan 15m cũ còn có frameBias bốn khung trong lib/zones.js. Ba phép đo có version và mục đích khác nhau; không gộp chúng làm một thước đo thống nhất.

## Ứng viên kế hoạch 15m cũ

Bộ nghiên cứu kế hoạch 15m trong lib/engine.js đọc 230 nến ENA 15m, 120 nến ENA 5m và 110 nến của các khung H1 H4 D1 liên quan. Đồng hồ Binance phải lệch không quá 5 giây. ATR Wilder 14 đòi ít nhất 200 nến. Bộ này xem tối đa bốn nến 15m mới nhất trong cửa sổ setup 45 phút, nhưng chỉ các lần đọc có receipt hiện tại mới được dùng làm tri thức cho quyết định; một close lịch sử không phải receipt lịch sử.

Một market event có RVOL ít nhất 1.5 và hoặc breakout 20 nến, hoặc biến động 1h ít nhất 3 phần trăm cùng dấu taker delta. Momentum không có breakout chỉ là WATCH. Ứng viên đủ điều kiện hướng lệnh còn cần breakout và delta cùng hướng. Long cần BTC H4 không DOWN hoặc UNKNOWN, BTC H1 UP và ENA H1 UP; Short cần BTC H4 không UP hoặc UNKNOWN, BTC H1 DOWN và ENA H1 DOWN.

Mốc entry ứng viên là một tick ngoài prior20High hoặc prior20Low. Stop ứng viên dựa trên pivot ENA 15m đã biết và cực trị nến setup, thêm đệm 0.15 lần ATR 15m. Mục tiêu ứng viên là pivot H1 hoặc H4 đã biết trong 10 ngày, ở phía có lợi của entry. Chi phí vòng được giả định bằng 0.23 phần trăm entry, chưa hiệu chuẩn theo tài khoản; net R:R bằng khoảng cách target trừ chi phí chia khoảng cách stop cộng chi phí, và phải ít nhất 2. Một retest từ nến 5m đóng sau setup, có giá và delta đúng hướng, phải xuất hiện trong 45 phút. Nếu thiếu bất kỳ điều kiện nào, ứng viên ở WATCH với reason code.

API công khai chặn thêm một lớp: nếu engine cũ trả SIGNAL_READY, API hạ thành WATCH, đặt signal bằng null, xóa candidate entry stop target và netRR khỏi watch, và giữ tradePermission NO_TRADE. Vì vậy một ứng viên nghiên cứu trong engine không trở thành lệnh, Paper fill hoặc kế hoạch rủi ro được duyệt trên website.

## Hợp đồng trạng thái và API

GET /api/live trả HTTP 200 cả khi nghiên cứu bị chặn; client phải đọc trường status và reason, không coi HTTP 200 là tín hiệu. Lỗi clock hoặc đọc nguồn bắt buộc tạo DATA_BLOCKED với signal null, tradePermission NO_TRADE, executionEnabled false và reason. Nếu một số khung phụ thiếu nhưng nhánh 15m cũ vẫn đọc được, API vẫn trả bảng đa khung, với audit riêng cho khung lỗi. Các timestamp và sourceReceipts đi cùng sourceAudit; sourceErrors giữ lỗi từng endpoint.

Các trường chính của đánh giá khung gồm symbol, timeframe, market, priceBasis, barCutoff, decisionAt, receivedAt, closedAt, close, audit, structure, pivotRadius, volume, breakout, state, leaning, reasons, blockedBy, scenarios và các trường rủi ro null. frameBiasBySymbol là bản đồ BTCUSDT và ENAUSDT theo sáu khung; biasBySymbol là tổng hợp cấu trúc riêng theo cặp. moduleCoverage ghi trạng thái các mô đun chưa triển khai.

GET /api/feed đọc một state JSON công khai do GitHub Actions lưu. Chỉ state có polledAt nguyên, executionEnabled false và signals là mảng mới qua kiểm tra. Feed FRESH khi tuổi không quá 18 phút, còn lại STALE; HTTP 404 là AWAITING_FIRST_CLOUD_RUN. Danh sách archivedReadyPlans bị lọc theo trường entry, stop, target, netRR ít nhất 2 và trigger5mClosedAt. Đây là bản lưu nghiên cứu ngoài site, không phải lịch sử khớp sàn, không chứng minh scheduler hoạt động đúng giờ hoặc có lệnh thật.

| Trạng thái | Ý nghĩa | Được đặt lệnh |
|---|---|---|
| DATA_BLOCKED | API thiếu nguồn bắt buộc, clock lỗi hoặc lỗi nghiên cứu | Không |
| DATA_INCOMPLETE | Khung riêng thiếu nến, conflict, gap, warm up, receipt hoặc metadata | Không |
| WAIT | Khung hợp lệ nhưng chưa có breakout 20 nến | Không |
| WATCH | Có quan sát breakout hoặc ứng viên nghiên cứu còn thiếu gate | Không |
| NO_SETUP | Bộ 15m không thấy setup hợp lệ ở lần quét | Không |
| NO_TRADE | Quyền giao dịch của đánh giá khung và website | Không |

Khi giao diện ghi LONG BIAS hoặc SHORT BIAS, đó là hướng quan sát của khung đã chọn, không phải trạng thái lệnh. Signed score bằng LongEvidencePct trừ ShortEvidencePct; coveragePct chỉ là độ phủ ba thành phần của score. Không có mô hình hiệu chuẩn xác suất thành công.

## Giới hạn rủi ro và những gì chưa triển khai

Website không có equity tài khoản, rủi ro mở, phí thực, slippage, funding đã chốt hay xác nhận vị thế. Vì thế không thể tính size, stop execution, lợi nhuận sau chi phí hoặc net R:R dùng để ra lệnh. Cost 0.23 phần trăm trong bộ plan cũ chỉ là giả định nghiên cứu. Không lấy số dư Paper hay ledger hệ thống khác làm số dư thật. Trang không kết nối Paper broker và không có khóa giao dịch.

moduleCoverage hiện đánh dấu NOT_IMPLEMENTED cho chu kỳ vĩ mô, chỉ mục nguồn Pring, OI 15 và 60 phút, funding đã chốt so với funding hiển thị, flow spot tách futures, độ bền order book và reverse divergence. Account risk and costs là NOT_VERIFIED. Không có full SCMv3 engine, kiểm định ngoài mẫu, xác suất thắng được hiệu chuẩn, private stream, lệnh bảo vệ trên sàn, hay reconciliation của lệnh thật. Không dùng tên gọi full engine cho bộ quan sát hiện tại.

Các dữ liệu chưa có phải giữ null hoặc NOT_IMPLEMENTED. Bất kỳ V2 nào thêm OI, mark/index, funding, spot flow hoặc order book phải có nguồn, đơn vị, cửa sổ, event time, receivedAt, decisionAt, freshness và kiểm thử causal riêng. Không suy ra dòng tiền lớn từ một ảnh order book hay từ taker share.

## Kiểm thử và vận hành V1

Yêu cầu Node 20 trở lên. Từ gốc gói mã nguồn: npm test kiểm tra unit và regression; npm run check kiểm tra cú pháp; node tests/local-ui-smoke.cjs kiểm tra giao diện bằng fixture desktop và mobile; PORT=3000 npm start chạy local tại 127.0.0.1; node scripts/live-ui-smoke.mjs kiểm tra một site đang chạy, với SCM_BASE_URL để chọn endpoint; node scripts/scan-once.mjs tạo snapshot mới vào evidence. Chạy one shot sẽ gọi nguồn public đang hoạt động và tạo một file mới; không dùng snapshot cũ làm kết quả hiện tại.

Regression hiện bao gồm loại nến đang mở, gap/duplicate/conflict, receipt đến muộn, pivot knownAt, zone BROKEN, ATR khóa tại origin, bias null khi nguồn lỗi, net R:R và retest 5m, hết hạn setup, khóa execution. Browser smoke kiểm tra chart và thẻ Signal trên desktop/mobile. Kết quả test là bằng chứng mã chạy theo fixture, không chứng minh lợi nhuận, xác suất thắng hoặc tương đương khớp lệnh.

Khi API trả DATA_BLOCKED, kiểm tra reason và sourceErrors, đồng hồ Binance, metadata và receipt của request cùng run. Không dùng nến hoặc lock từ lần trước thay bằng chứng mới. Khi một khung có DATA_INCOMPLETE, đối chiếu audit của chính khung đó; không sửa dữ liệu bất lợi hoặc bỏ qua xung đột. HTTP 403, 429, 451 cần giữ trạng thái lỗi và chờ nguồn hợp lệ; không tự đổi credential, proxy hay host để vượt hạn chế. Khi feed stale, xác minh run công khai trước khi nói scheduler đã hoạt động.

## Hướng phát triển sau V1

Ưu tiên đầu tiên là lưu raw response, request và receipt bền vững theo cohort; thêm scheduler với idempotency và đối soát một bản ghi cho mỗi nến đóng. Sau đó định nghĩa và kiểm thử source conflict reconciliation có version, knownAt và hiệu lực rõ ràng. Tiếp theo mới bổ sung các mô đun chưa triển khai, giữ dữ liệu thiếu là null và xác thực đơn vị/cửa sổ. Mọi phiên bản tín hiệu mới cần kiểm thử causal, chống repaint, chi phí theo tài khoản, đối soát equity và vị thế, nhiều chế độ thị trường và ngoài mẫu. Paper broker phải tách khỏi quan sát, có journal fill/exit, cash reconciliation và fidelity audit. Giao dịch thật cần một dự án phê duyệt riêng với kill switch, private stream, lệnh bảo vệ đã ACK và diễn tập restart; V1 không chứa những khả năng đó.

## Bản đồ tệp và định danh bản đóng gói

| Tệp | Vai trò | SHA 256 tại thời điểm chốt |
|---|---|---|
| index.html | Giao diện chart, Signal, bias và gates | fbdeec15d65b6b27336d5dd513d96fa92399da4afee59217083396ec489b273d |
| api/live.js | Đọc nguồn và khóa trạng thái website | acea21d850c9720205e3c0b4a3513fd85720cb0c62d8781d502248b58fccd5b7 |
| api/feed.js | Feed receipt công khai | e53402f928cdfbc86d96a928824c9664f6292fcd572b2ecf7f9eb4c0f0fce5bf |
| lib/engine.js | Ứng viên kế hoạch nghiên cứu 15m cũ | 0da09399eadab96e55672f192186f281fff24a1533f92a8210d28353c2abe5b0 |
| lib/multiframe.js | Audit và đánh giá đa khung | c24b754846fc654a75c6e7f8ba3467692f302485a703e3a05bf957d395520226 |
| lib/zones.js | Vùng cung cầu quan sát | da93596f1f9233e5801c14124cf24703180b9caba324b4a9a4820f64376cdbe6 |

Gói ZIP chỉ chứa mã nguồn, cấu hình, tài liệu và bài kiểm thử. Không gồm node_modules, .env, khóa, token, snapshot evidence hoặc ảnh smoke. Danh sách file và SHA 256 được lưu trong SOURCE_MANIFEST.sha256 bên trong gói để kiểm tra lại sau tải xuống.
