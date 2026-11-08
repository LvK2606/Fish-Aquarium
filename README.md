# Fish Aquarium — Aqualator mirror

Bản sao tự chứa của giao diện công khai [Aqualator](https://www.aqualator.cloud/), kèm backend độc lập cho tài khoản, lưu bể và khu trưng bày. Gói JavaScript/CSS gốc được giữ nguyên để bảo toàn mô phỏng, asset và animation. Mã backend gốc không được cung cấp công khai; thư mục `server/` là phần triển khai mới cho bản sao.

## Nội dung

- 588 tệp tải từ trang nguồn, gồm 76 mô hình GLB, texture cá theo biến thể/giới tính, cây, lũa, mèo, ảnh cảnh dựng sẵn, biểu tượng và màn hình tải.
- Mô phỏng bể, chăm cá, sinh sản, cây thủy sinh, hóa học nước, bảo dưỡng, thiết bị, cửa hàng/kho đồ, đơn khách, minigame, nhiều bể, hướng dẫn và sổ ngày có trong bundle gốc.
- Nhạc và âm thanh được tổng hợp bằng Web Audio; chuyển động cá/cây và hiệu ứng được thực hiện bằng WebGL/JavaScript.
- Font Baloo 2 (`@fontsource-variable/baloo-2@5.3.0`), Noto Sans SC (`@fontsource-variable/noto-sans-sc@5.3.1`) và M PLUS Rounded 1c (`@fontsource/m-plus-rounded-1c@5.3.0`) được lưu cục bộ, kèm giấy phép OFL, cho đủ bốn ngôn ngữ.
- Backend dùng Vercel Blob riêng, cookie phiên đăng nhập và băm mật khẩu. Các request API của bản sao không được chuyển tiếp tới Aqualator gốc. Khu trưng bày bắt đầu với dữ liệu mới, không sao chép tài khoản hoặc dữ liệu riêng tư của người dùng trang nguồn.

`source-assets.json` ghi URL nguồn, kích thước và SHA-256 của toàn bộ tệp tải về. `public/index.html` thay Google Fonts bằng font cục bộ và trỏ metadata chia sẻ về tên miền bản sao; bundle chính chỉ thay hai URL font Nhật/Trung bằng đường dẫn cục bộ. Build khôi phục hai URL này trong bộ nhớ để xác minh hash gốc, bảo đảm không đổi mã mô phỏng/animation. Tên thương hiệu, tài nguyên gốc và các ghi chú bản quyền vẫn thuộc chủ sở hữu tương ứng.

`public/replica.css` điều chỉnh vị trí nút tài khoản trên màn hình laptop để tránh che các nút chăm sóc bể; stylesheet gốc vẫn được giữ nguyên.

## Phát triển

Yêu cầu Node.js 22.x.

```sh
npm ci
npm run dev
```

Máy chủ chạy cổng 3000; đặt `PORT` để đổi cổng. Mô phỏng và dữ liệu localStorage chạy ngay. Các tính năng đám mây cần cấu hình backend được mô tả bên dưới; không dùng lưu trữ tạm trong production.

```sh
npm run build
npm run test:backend
npx playwright install chromium
npm run test:frontend
```

Để dùng Chromium có sẵn: `CHROMIUM_PATH=/usr/bin/chromium npm run test:frontend`. Kiểm thử giao diện dùng dữ liệu và máy chủ kiểm thử riêng, ảnh chụp nằm trong `test-results/`.

## Vercel

Project: `fish-aquarium`, repository: `LvK2606/Fish-Aquarium`. `vercel.json` đặt framework Other, build `npm run build`, output `public/`, và một Vercel Function cho `/api/*`. Push lên `main` kích hoạt production deployment khi Git integration đã kết nối.

Website: **https://fish-aquarium-five.vercel.app**. Production đã READY, backend dùng private Blob store riêng. Project dùng Node 22.x và đã tắt lớp Vercel Authentication để người chơi truy cập website công khai; đăng nhập tài khoản trong ứng dụng vẫn do backend xử lý.

Các biến server cần thiết trong Vercel → Project → Settings → Environment Variables:

| Biến | Mục đích |
| --- | --- |
| `AUTH_SECRET` | Khóa ngẫu nhiên ký phiên đăng nhập; đã tạo và lưu dưới dạng encrypted. |
| `BLOB_READ_WRITE_TOKEN` | Được Vercel tự thêm khi kết nối private Blob store `fish-aquarium-data`. |
| `APP_ORIGIN` | URL HTTPS chính của bản sao; dùng khi tạo liên kết email. |
| `RUN_CLOUD_STORAGE_CHECK` | Đặt `1` trên Vercel để build kiểm tra Blob thật, cạnh tranh ETag, đăng ký và lưu/đọc bể trên một object kiểm thử riêng rồi xóa object đó. |
| `RESEND_API_KEY` | Khóa gửi email qua Resend; chỉ cần khi bật thư xác minh/khôi phục mật khẩu. |
| `EMAIL_FROM` | Tên và địa chỉ gửi đã được xác minh, ví dụ `Fish Aquarium <no-reply@tenmien-cua-ban>`. |

Không đưa giá trị khóa vào Git hoặc chat. Với thay đổi biến môi trường, chọn môi trường production/preview cần dùng rồi redeploy.

## Bật email sau

Theo lựa chọn hiện tại, mã xác minh email và khôi phục mật khẩu được chuẩn bị nhưng chưa cấu hình gửi thư thật.

1. Tạo tài khoản Resend và xác minh tên miền gửi bằng các bản ghi DNS do Resend cung cấp.
2. Tạo API key có quyền gửi thư.
3. Thêm `RESEND_API_KEY`, `EMAIL_FROM` và `APP_ORIGIN` vào Environment Variables của project Vercel, rồi redeploy.
4. Kiểm tra gửi lại thư xác minh và luồng quên mật khẩu trên bản sao.

Khi chưa có dịch vụ email, API báo thiếu cấu hình cho thao tác gửi thư; không trả token khôi phục công khai và không giả vờ đã gửi email.

## Hotfix hiệu năng (nhánh `hotfix/shop-longtasks-adaptive-dpr`)

- Shop tạo cả mô hình và render ảnh thẻ 256px tuần tự qua hàng đợi idle, `createImageBitmap` + `canvas.toBlob` WebP (dự phòng JPEG), thay vì PNG Data URL đồng bộ. Ảnh cache dưới dạng Blob URL trong phiên.
- Bật lại `frustumCulled` cho các `InstancedMesh` ứng dụng; ngoại lệ thư viện Three.js giữ nguyên cho tam giác full-screen postprocessing.
- Scene chính dùng DPR di động 1–1,5 và hai thành phần `AdaptiveDpr`/`PerformanceMonitor` tự hạ DPR sau khung hình chậm; mức cao sẽ trở lại sau khoảng ổn định. Không làm giảm texture gốc.
- Kiểm tra: `npm run build`, `npm run test:performance`, `npm run test:backend`, `TEST_FILTER=Shop npm run test:frontend`. Browser test in `SHOP_LONG_TASKS` với `count`, `maxMs`, `totalMs` và thời gian mở Shop. Giá trị đo phụ thuộc GPU/CPU thực tế; kiểm thử hồi quy chưa phải cam kết FPS trên mọi máy.

Lưu ý: một lời gọi `toDataURL` trong tiện ích đồng bộ của Three.js vẫn được giữ để không phá vỡ API serialization của thư viện; **Shop và chức năng chụp ảnh của ứng dụng không còn gọi `toDataURL`**.
