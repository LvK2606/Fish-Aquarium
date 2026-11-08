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

## Tối ưu tốc độ tải mà không giảm chất lượng ảnh

Bản nguồn trong `public/` tiếp tục giữ nguyên asset gốc và SHA-256. Lệnh `npm run build` kiểm chứng 588 asset gốc trước, sau đó sao chép sang `dist/` và thử nén lại **chỉ dữ liệu IDAT của PNG** bằng zlib mức cao. Bản nén chỉ được dùng khi thực sự nhỏ hơn. Các scanline giải nén (tương đương pixel, cả kênh alpha) và tất cả chunk metadata PNG còn lại không đổi; GLB, geometry, vật liệu, bundle mô phỏng và animation không bị chỉnh sửa.

Vercel phục vụ `dist/`; chính sách cache dành cho các bundle đã gắn hash dài hạn, còn texture/model/font không gắn hash có thời hạn ngắn hơn để vẫn nhận cập nhật nội dung. Không cache các phản hồi tài khoản/cloud API (backend đã đặt `Cache-Control: no-store`).

```sh
npm ci
npm run build                        # Hiện số PNG giảm được và tổng MiB tiết kiệm
npm run test:backend                 # Bao gồm test PNG giữ nguyên dữ liệu ảnh
npx playwright install chromium
CHROMIUM_PATH="$(node -p 'require("playwright").chromium.executablePath()')" npm run test:frontend:deploy
```

Kiểm thử giao diện trên `dist/` vẫn dùng backend bộ nhớ riêng và kiểm tra mô hình/animation, không ghi sang tài khoản thật. Có thể kiểm tra bản deploy ngay trên máy bằng `SERVE_DEPLOY_OUTPUT=1 npm run dev` sau khi build. `dist/` là sản phẩm build, không đưa vào Git. Nếu file PNG đã được nén tốt, mức tiết kiệm có thể rất nhỏ hoặc bằng không; không nên tuyên bố giảm phần trăm khi chưa có log build thực tế.

## Bật email sau

Theo lựa chọn hiện tại, mã xác minh email và khôi phục mật khẩu được chuẩn bị nhưng chưa cấu hình gửi thư thật.

1. Tạo tài khoản Resend và xác minh tên miền gửi bằng các bản ghi DNS do Resend cung cấp.
2. Tạo API key có quyền gửi thư.
3. Thêm `RESEND_API_KEY`, `EMAIL_FROM` và `APP_ORIGIN` vào Environment Variables của project Vercel, rồi redeploy.
4. Kiểm tra gửi lại thư xác minh và luồng quên mật khẩu trên bản sao.

Khi chưa có dịch vụ email, API báo thiếu cấu hình cho thao tác gửi thư; không trả token khôi phục công khai và không giả vờ đã gửi email.

## GPU-optimized High: sharp image, fewer wasted frames

- **Original sharpness at rest:** mobile High renders at native DPR up to 2x and preserves all original PNG texture pixels, GLB fish models, fish animation and every plant leaf. The normal view is not upscaled from a permanently blurred image.
- **Demand-scheduled GPU frames:** mobile High requests roughly **30 frames/second** at rest and up to **60 during touch dragging**. Touch events trigger immediate invalidation to improve response. Other game invalidations and the device refresh rate may affect actual FPS.
- **Only overloaded gestures reduce the number of pixels:** after approximately 450 ms of a demonstrably slow (<41 FPS) drag, a temporary 1.55 DPR render budget becomes available. DPR returns to the original full resolution when the gesture ends. Idle 30 FPS and taps never downscale.
- **Plant geometry budget:** unusually dense tanks (600+ leaves) use 8 rather than 10 leaf-curve segments on mobile High, retaining all original leaf instances, shading, shapes and selection IDs. Normal-density tanks and desktop High keep 10 segments. Only far moss uses a simpler strand.
- **Compositor:** mobile High retains Bloom on a lower-resolution intermediate buffer and avoids extra composer MSAA; the main 3D render retains its original full resolution outside slow interactions.
- **Less redundant processing:** prevent a second invalidation timer in mobile High, pause render requests on hidden tabs, and avoid touch hover raycasts when not editing scenery.
- **Verify on your device:** append `?perf=1` to the Preview URL to display current DPR, observed frame rate, GPU draw calls, triangle count and drag/idle state. The overlay is entirely opt-in.

Build verification still hashes original assets before patching only the fingerprinted `dist/` bundle. GPU gains are device- and scene-dependent, not a promise of 60 FPS. Test real Android interaction before merging to production.

Run `npm run build && npm run test:backend && npm run test:frontend:deploy` to validate the performance governor and browser regressions.

## High Mobile GPU Lite (experimental Preview)

The recorded Android test showed 12–20 rendered FPS even at full DPR 2.0, which is not resolved by limiting requests to 30 frames per second. Mobile High now preserves the original fish GLBs, texture pixels and native 2x render scale at rest, but **eliminates the multi-pass Bloom/Vignette EffectComposer** on mobile High and substitutes a cheaper water caustics shader (two periodic waves instead of two 3×3 Voronoi searches plus 3D noise) to reduce GPU work for each pixel. Desktop High continues using the original expensive effects and shader.

When a settings/device dialog obscures the tank, idle 3D render requests are throttled to approximately 10 Hz so the UI has more GPU headroom. When the user actively drags the aquarium, normal interactive frame scheduling takes priority. The original assets and simulated tank population are unchanged. Water glints and glow look somewhat different on mobile compared with original High; this is an intentional visual tradeoff to retain fish detail and interactive usability.

Use `?perf=1` for the diagnostic HUD and optionally `?perf=1&effects=on` to force the old mobile High postprocessor for side-by-side testing. Neither setting guarantees 60 FPS; verify on the actual Android GPU. Do not merge the experiment without user acceptance.
