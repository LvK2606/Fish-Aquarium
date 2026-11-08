# Trạng thái công việc

Cập nhật: 08/11/2026 (Asia/Saigon).

## Mục tiêu và quyết định đã duyệt

- Clone Aqualator vào `LvK2606/Fish-Aquarium`, giữ toàn bộ tính năng có thể truy cập, asset và animation; đẩy GitHub và triển khai Vercel.
- Người dùng đã chọn xây backend độc lập cho tài khoản, lưu đám mây, chia sẻ bể và bảng xếp hạng.
- Người dùng chưa có dịch vụ email: chuẩn bị mã xác minh/khôi phục mật khẩu và hướng dẫn cấu hình sau, chưa bật gửi thư thật.
- Không ghi dữ liệu/tài khoản vào API Aqualator gốc; không thay đổi hai dự án đã hoàn thành `Fish-Tank` và `aquarium`.

## Đã hoàn thành, có bằng chứng

Các công việc trước đã kết thúc: `Fish-Tank` mirror ZenAqua tại commit `d4634cc` và Vercel `fish-tank-xi.vercel.app`; dự án `aquarium` đã chuyển sang đủ 8 loài Fish-Tank tại commit `7eae0dc`, Vercel `aquarium-opal.vercel.app`. Không chạy lại hoặc ghi đè các dự án này. Vercel CI từng được kiểm tra nhưng skill yêu cầu Turborepo; chưa có yêu cầu chuyển dự án sang monorepo nên không tự triển khai thay đổi đó.

- Repository mục tiêu tại `/workspace/fish-aquarium`, branch `main`; commit đầu `a458a6df2da03cbf78916d053f4827c7c72f75c7` đã đẩy GitHub.
- Đã tải 588 tệp nguồn, 63.570.718 byte, gồm 76 GLB, toàn bộ texture biến thể/giới tính và 3 cảnh mẫu. `source-assets.json` lưu SHA-256, không có tệp tải lỗi.
- Build xác minh hash, GLB/PNG đã đạt; font Việt/Anh/Nhật/Trung đã cục bộ hóa. Hai URL font trong bundle được đổi có kiểm soát và khôi phục trong bộ nhớ khi xác minh hash gốc.
- Đã viết backend riêng trong `server/`, route Vercel `api/[...path].js`.
- 9 kiểm thử backend đạt: auth/cookie, CSRF, quyền sở hữu, xung đột revision, lịch sử/khôi phục, cộng đồng, email token, Blob CAS và telemetry. Một agent khác đã rà soát bảo mật độc lập.
- Lượt frontend cuối không filter đã đạt **13/13**, exit 0: 60 GLB và 272 tài nguyên cục bộ; không asset lỗi, request tài nguyên ngoài hay lỗi JavaScript. Log `/tmp/frontend-full-final.log`; ảnh trong `test-results/{cong-lua,tuyet-trang,lang-tuyet,mobile}.png` (ignored). Đã xem ảnh preset và mobile thực tế.
- Browser đã kiểm tra 3 cảnh/animation/cho ăn, đo nước, kho/thiết bị, bày trí, minigame, ngôn ngữ/font/đồ họa/âm thanh, đăng ký → upload đầu → thay đổi bể/lưu cloud → GET xác minh dữ liệu → logout/login → publish snapshot thật → visit/render/title, cửa hàng/3 thiết kế, reload và điện thoại 390px.
- Vercel project `fish-aquarium`: `prj_avJZep2EwHRfEIdh1rXIUPHKAPuL`, GitHub repo ID `1449604314`.
- Private Blob store `fish-aquarium-data`: `store_Qsbz7n2XRVnS5AoL`, đã kết nối project.
- Metadata Vercel xác nhận `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` encrypted và `APP_ORIGIN` đã cấu hình. Không lưu giá trị secret trong repository.
- Release ứng dụng `4cc254284f8ca5cc779f7a4bf6133c83a4bb91b4` đã đẩy GitHub `main`; production `https://fish-aquarium-five.vercel.app` đã READY tại deployment `dpl_8FdkUik3BoZ2pexW2k86z4RZ3oou` đúng SHA này. Lần cập nhật bản ghi trạng thái sau release chỉ sửa tài liệu, không đổi mã ứng dụng hay kiểm thử.
- Build Vercel Node 22 đã đạt kiểm tra Blob thật: private persistence, hai ghi cùng ETag chỉ một thắng, tài khoản/phiên đăng nhập, lưu/đọc từ handler mới và xung đột revision 409. Object kiểm thử đã xóa. Log có `CLOUD STORAGE CHECK PASSED`.
- Project Settings đã đồng bộ Node 22.x và `ssoProtection: null` để website công khai, không bắt người chơi đăng nhập Vercel.

## Đợt chốt và phần còn lại

- Font Nhật/Trung đã hoàn tất. CSS riêng đã sửa nút tài khoản che nút chăm sóc trên laptop. Không còn tính năng cần sửa từ các kiểm thử đã chạy.
- Commit chốt `4cc2542` đã triển khai thành công, log build xác nhận lại đủ 588 hash và `CLOUD STORAGE CHECK PASSED` trên Blob thật; đã xóa object kiểm thử. Git không còn thay đổi mã chưa đẩy. Commit ghi nhận trạng thái này cũng tự kích hoạt Vercel; khi cần kiểm tra phiên mới nhất, đối chiếu `git log -1` với `meta.githubCommitSha` và READY, không tải lại hay xây lại dự án từ đầu.
- Email xác minh/khôi phục mật khẩu **chưa bật theo quyết định của người dùng**. Mã và kiểm thử token/provider đã có; hướng dẫn `README.md` mục “Bật email sau”. Chỉ thêm `RESEND_API_KEY` và `EMAIL_FROM` vào Vercel khi có dịch vụ, rồi redeploy và thử gửi thật.
- HTTP/browser production trực tiếp chưa kiểm tra được vì Cloud proxy chặn hostname mới (CONNECT 403). Vercel READY, function đã build và Blob thật đã kiểm chứng trong Vercel build. Browser 13/13 chạy ở localhost với backend kiểm thử riêng; không được gộp hai loại bằng chứng thành tuyên bố browser production đã đạt. Nếu cần kiểm tra trực tiếp từ Cloud, cho phép `fish-aquarium-five.vercel.app` trong Environment settings rồi thử lại.

## Lịch sử lỗi đã xử lý / bằng chứng

Deployment đầu Node 26 (`a458a6d`, `dpl_EVa8FKSFFJczcwQNYEQuQQR4nhYs`) chưa đạt assertion loại lỗi cạnh tranh Blob. Bản pin Node 22 kế tiếp đã đạt toàn bộ smoke trên dữ liệu thật. Giữ build smoke để phát hiện tái diễn; chưa đủ bằng chứng quy lỗi riêng cho Node 26.

Các lần dừng ở test UI là selector/chế độ kiểm thử: `luu=0` không tạo snapshot; bể no cần nhấp xác nhận lần hai; category dùng nhãn `Fish & shrimp`. Shop gốc tạo toàn bộ thumbnail đồng bộ bằng WebGL nên máy kiểm thử GPU phần mềm cần thời gian dài hơn 25 giây; tăng timeout riêng test Shop lên 180 giây, không sửa mã mô phỏng. Ảnh preset và mobile lưu ở `test-results/` (không commit).

Lượt tổng hợp đầu đạt 12 nhóm tính năng nhưng bắt `SecurityError` do initScript kiểm thử truy cập localStorage trên `about:blank`. Repro tối thiểu xác nhận stack; thêm guard chỉ khởi tạo trên HTTP(S), giữ nguyên kiểm tra lỗi của ứng dụng. Lượt cuối sau sửa đã đạt 13/13, không bỏ qua assertion nào.

## Lưu ý khi tiếp tục

- Không cài hay tải lại 588 tệp hay font đã có và đã kiểm chứng.
- `npm run test:backend` dùng memory/injected provider; Blob thật được kiểm tra riêng trong Vercel build, đã đạt ở deployment nêu trên.
- `NODE_ENV=test BACKEND_TEST_MODE=1` là chế độ test được chọn rõ ràng; production tuyệt đối không tự chuyển sang memory storage.
- Mô phỏng gốc: `hocviec=0` mở khóa tính năng nhưng tạo bể trống; muốn kiểm tra cá ở preset dùng `?moi=1&hoithoai=0&luu=0&bocuc=cong-lua` (không thêm `hocviec=0`).
- Cloud proxy hiện cho phép API Vercel và Aqualator nguồn; request trực tiếp `https://fish-aquarium-five.vercel.app/api/health` đã bị proxy từ chối CONNECT 403. Không được báo rằng đã kiểm thử HTTP/browser production từ môi trường này. Có bằng chứng Vercel READY và Blob build smoke; đang kiểm thử browser ở localhost.
