# Trạng thái công việc

Cập nhật: 08/11/2026 (Asia/Saigon).

## Mục tiêu và quyết định đã duyệt

- Clone Aqualator vào `LvK2606/Fish-Aquarium`, giữ toàn bộ tính năng có thể truy cập, asset và animation; đẩy GitHub và triển khai Vercel.
- Người dùng đã chọn xây backend độc lập cho tài khoản, lưu đám mây, chia sẻ bể và bảng xếp hạng.
- Người dùng chưa có dịch vụ email: chuẩn bị mã xác minh/khôi phục mật khẩu và hướng dẫn cấu hình sau, chưa bật gửi thư thật.
- Không ghi dữ liệu/tài khoản vào API Aqualator gốc; không thay đổi hai dự án đã hoàn thành `Fish-Tank` và `aquarium`.

## Đã hoàn thành, có bằng chứng

Các công việc trước đã kết thúc: `Fish-Tank` mirror ZenAqua tại commit `d4634cc` và Vercel `fish-tank-xi.vercel.app`; dự án `aquarium` đã chuyển sang đủ 8 loài Fish-Tank tại commit `7eae0dc`, Vercel `aquarium-opal.vercel.app`. Không chạy lại hoặc ghi đè các dự án này. Vercel CI từng được kiểm tra nhưng skill yêu cầu Turborepo; chưa có yêu cầu chuyển dự án sang monorepo nên không tự triển khai thay đổi đó.

- Repository mục tiêu tại `/workspace/fish-aquarium`, branch `main`; đang tạo và đẩy commit đầu để Vercel kiểm tra lưu trữ thật.
- Đã tải 588 tệp nguồn, 63.570.718 byte, gồm 76 GLB, toàn bộ texture biến thể/giới tính và 3 cảnh mẫu. `source-assets.json` lưu SHA-256, không có tệp tải lỗi.
- Build xác minh hash, GLB/PNG đã đạt; font Việt/Anh/Nhật/Trung đã cục bộ hóa. Hai URL font trong bundle được đổi có kiểm soát và khôi phục trong bộ nhớ khi xác minh hash gốc.
- Đã viết backend riêng trong `server/`, route Vercel `api/[...path].js`.
- 9 kiểm thử backend đạt: auth/cookie, CSRF, quyền sở hữu, xung đột revision, lịch sử/khôi phục, cộng đồng, email token, Blob CAS và telemetry. Một agent khác đã rà soát bảo mật độc lập.
- Vercel project `fish-aquarium`: `prj_avJZep2EwHRfEIdh1rXIUPHKAPuL`, GitHub repo ID `1449604314`.
- Private Blob store `fish-aquarium-data`: `store_Qsbz7n2XRVnS5AoL`, đã kết nối project.
- Metadata Vercel xác nhận `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` encrypted và `APP_ORIGIN` đã cấu hình. Không lưu giá trị secret trong repository.
- Tên miền project đã được Vercel cấp: `fish-aquarium-five.vercel.app`; chưa có deployment.

## Đang làm / chưa hoàn thành

1. Font Nhật/Trung đã hoàn tất. Đã thêm CSS riêng để nút tài khoản không che nút chăm sóc trên laptop.
2. Cả 3 preset đã đạt GLB/animation; đo nước, kho/thiết bị, bày trí và minigame đã đạt. Đang hoàn tất settings, tài khoản/lưu đám mây, publish → visit, cửa hàng, reload và mobile. Những lần dừng vừa qua là selector kiểm thử sai (role radio, nhãn Sound on, nhấp label công tắc), đã sửa.
3. Đã thêm `scripts/check-cloud-storage.mjs` và bật `RUN_CLOUD_STORAGE_CHECK=1` trên Vercel. Chưa chạy trong deployment; kiểm tra dùng object riêng và xóa sau khi hoàn tất.
4. Build/check cuối; commit/push GitHub `main`; theo dõi deployment đúng SHA đến READY.
5. Báo URL và giới hạn email chưa cấu hình; cập nhật bản ghi này ở từng mốc.

## Lưu ý khi tiếp tục

- Không cài hay tải lại 588 tệp đã có; chỉ bổ sung font còn thiếu.
- `npm run test:backend` dùng memory/injected provider; chưa chứng minh Blob thật.
- `NODE_ENV=test BACKEND_TEST_MODE=1` là chế độ test được chọn rõ ràng; production tuyệt đối không tự chuyển sang memory storage.
- Mô phỏng gốc: `hocviec=0` mở khóa tính năng nhưng tạo bể trống; muốn kiểm tra cá ở preset dùng `?moi=1&hoithoai=0&luu=0&bocuc=cong-lua` (không thêm `hocviec=0`).
- Cloud proxy hiện cho phép API Vercel và Aqualator nguồn; chưa cho phép hostname deployment mới để kiểm tra HTTP công khai từ môi trường này.
