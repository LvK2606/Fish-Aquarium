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

## Mobile High Adaptive — experimental Preview

The source-verified bundle under `public/` remains unchanged. The build patches a fingerprinted copy in `dist/` and verifies the original 588 asset hashes first.

- **Continuous adaptive DPR:** Mobile High starts at up to **1.8 DPR** on stronger devices, or **1.5 DPR** on devices reporting <=4 GB RAM / <=4 CPU threads. Rendered frames are sampled over ~650 ms windows and DPR gradually decreases to **1.0** after sustained FPS below 47. With sustained FPS above 57, DPR increases again in smaller steps. This works while idle as well as during touch and never jumps straight to full resolution on finger release.
- **Render cadence and input:** Up to **60 frame requests/sec** while visible, not a hard 30 FPS idle limit. When modal overlays cover the tank, requests drop to around 12 Hz; interactions trigger immediate canvas invalidation. Turning off camera damping on mobile reduces the feeling of post-touch inertia. Expensive hover raycasts are bypassed while dragging except during aquascape edit.
- **GPU budget:** Mobile High uses MSAA 0, a cheaper caustics shader and skips the expensive fullscreen Bloom/Vignette postprocessor by default. Desktop High retains original graphics. Add `?effects=on` in the preview to inspect the legacy mobile effects.
- **Geometry:** All GLB fish models and original texture pixels are retained. A very dense mobile planting scene reduces leaf tessellation (not leaf population); static foliage groups use conservative computed instance bounds for group-level frustum culling. Moving fish instance groups remain uncullable to avoid disappearing fish from stale bounding volumes. This is not per-instance culling.
- **Shop thumbnails:** The preview renderer now draws **320x192**, encodes via asynchronous `canvas.toBlob('image/webp', .85)`, schedules work in a serialized queue and uses blob URLs for image display. Geometry/material cleanup is applied after each capture, and URLs are revoked on page exit. Browser support may fall back to PNG when WebP encoding is unavailable.
- **Diagnostics:** Add `?perf=1` to Preview URL for live measured FPS, DPR, draw calls, triangles, and GPU geometry/texture counts. These numbers measure rendered frames, not GPU execution time.
- **Tests:** `npm run build && npm run test:backend && npm run test:frontend:deploy` cover original asset fingerprints, auto-downscale/recovery, browser features and mobile controls. Run `npm run test:performance` for a 30-second mobile High telemetry report plus repeated Shop open/close counts, written to `test-results/mobile-performance.json`.

**Scope and limitations:** This branch does not import `@react-three/drei` or `three-mesh-bvh` into the precompiled source bundle; it integrates a small performance monitor directly with the R3F hooks already embedded in the application. It also does not blindly enable frustum culling on moving fish or convert original PNG textures to KTX2, which would require asset and loader changes. The goal is 60 FPS where the device can sustain it, not a guaranteed 60 FPS on every Android device. Software-rendered Playwright results cannot prove physical GPU performance. Review on a real phone before merging.
