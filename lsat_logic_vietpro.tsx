import React, { useState, useRef, useEffect } from 'react';
import { FileText, Languages, CheckCircle2, Download, AlertCircle, Wand2, ArrowRight } from 'lucide-react';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [outputData, setOutputData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPdfReady, setIsPdfReady] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.async = true;
      document.body.appendChild(script);

      const html2canvasScript = document.createElement('script');
      html2canvasScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      html2canvasScript.async = true;
      document.body.appendChild(html2canvasScript);
    }
  }, []);

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      setError('Vui lòng nhập nội dung bài toán LSAT bằng tiếng Anh.');
      return;
    }

    setIsLoading(true);
    setError('');
    setOutputData(null);
    setIsPdfReady(false);

    // Prompt đã được nâng cấp: Ép buộc tạo câu dẫn (Instruction)
    const systemPrompt = `Bạn là một chuyên gia luyện thi LSAT. Nhiệm vụ: Dịch và cấu trúc đề bài Logic Games/Logical Reasoning từ Tiếng Anh sang Tiếng Việt (JSON format).

Lệnh BẮT BUỘC (MANDATORY):
1. Rút gọn tên riêng: Anastasia -> A, Bill -> B.
2. Xử lý Từ Khóa (QUAN TRỌNG): Chỉ IN ĐẬM bằng cách bọc trong dấu sao đôi (**từ khóa**). TUYỆT ĐỐI KHÔNG VIẾT HOA TOÀN BỘ CHỮ CÁI. (Ví dụ: **không**, **chắc chắn**, **nếu**, **thì**, **trước**, **sau**... LÀ ĐÚNG. **KHÔNG**, **TRƯỚC**... LÀ SAI).
3. ĐẦY ĐỦ DỮ LIỆU: Phải trả về đầy đủ context (bối cảnh) và TẤT CẢ các questions (câu hỏi). Không được bỏ sót.
4. TỰ ĐỘNG TẠO CÂU DẪN (INSTRUCTION): Hãy xem xét mảng 'questions'. Nếu có nhiều hơn 1 câu hỏi, hãy tự động tạo ra câu instruction: "Dựa vào thông tin dưới đây để trả lời các câu từ [Số câu bắt đầu] đến [Số câu kết thúc]". Nếu chỉ có 1 câu hỏi, hãy để trống instruction.

Cấu trúc JSON yêu cầu:
{
  "instruction": "Câu hướng dẫn chung (để trống nếu không có)",
  "context": "Đoạn văn bối cảnh (BẮT BUỘC có)",
  "rules": ["điều kiện 1", "điều kiện 2", "..."],
  "questions": [
    {
      "number": "số/tên câu hỏi",
      "text": "Nội dung câu hỏi",
      "options": {
        "A": "đáp án A",
        "B": "đáp án B",
        "C": "đáp án C",
        "D": "đáp án D",
        "E": "đáp án E (nếu có)"
      }
    }
  ]
}
Chỉ trả về chuỗi JSON.`;

    try {
      const apiKey = ""; // API key is handled by the environment
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

      const payload = {
        contents: [{ parts: [{ text: inputText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
        }
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (result.error) {
          throw new Error(result.error.message || "Lỗi từ API");
      }

      const translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (translatedText) {
        try {
          const parsedData = JSON.parse(translatedText);
          setOutputData(parsedData);
          setIsPdfReady(true);
        } catch (e) {
          console.error("Parse Error:", e, "Raw Text:", translatedText);
          throw new Error("Lỗi đọc dữ liệu từ AI. Định dạng trả về không hợp lệ.");
        }
      } else {
        throw new Error("Không thể tạo bản dịch, vui lòng thử lại.");
      }

    } catch (err) {
      console.error(err);
      setError('Đã xảy ra lỗi khi xử lý: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return <span dangerouslySetInnerHTML={{ __html: safeText }} />;
  };

  const handleExportPDF = async () => {
    if (!isPdfReady || !outputRef.current || typeof window === 'undefined' || !window.jspdf) {
      setError('Chưa thể xuất PDF. Vui lòng chờ xử lý xong.');
      return;
    }

    try {
      // 1. Cấu hình kích thước A4 (mm)
      const A4_WIDTH = 210;
      const A4_HEIGHT = 295;
      const MARGIN = 15; // Lề an toàn
      
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // --- FIX LỖI CẮT CHỮ VÀ VIỀN: SỬ DỤNG CLONE NODE ---
      const originalElement = outputRef.current;
      const clonedElement = originalElement.cloneNode(true);

      // Tạo một container ẩn ngoài màn hình để chứa bản clone, thoát khỏi thanh cuộn của giao diện
      const printContainer = document.createElement('div');
      printContainer.style.position = 'absolute';
      printContainer.style.top = '-9999px';
      printContainer.style.left = '-9999px';
      printContainer.style.width = '800px'; // Khóa width
      document.body.appendChild(printContainer);

      // Xóa border, shadow của giao diện, chỉ để lại nền trắng và ép giãn hết chiều cao
      clonedElement.className = "bg-white"; 
      clonedElement.style.width = '800px';
      clonedElement.style.height = 'auto';
      clonedElement.style.maxHeight = 'none';
      clonedElement.style.overflow = 'visible';
      clonedElement.style.padding = '40px 50px';

      printContainer.appendChild(clonedElement);

      // Đợi 1 chút để trình duyệt render xong DOM ẩn
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Chụp ảnh từ bản clone chuẩn xác
      const canvas = await window.html2canvas(clonedElement, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollY: 0,
        windowWidth: 800
      });

      // Dọn dẹp DOM ngay sau khi chụp xong
      document.body.removeChild(printContainer);

      const imgWidth = A4_WIDTH - (MARGIN * 2); 
      // Tính chiều cao của toàn bộ nội dung tương ứng với chiều rộng đã thu phóng
      const imgHeight = (canvas.height * imgWidth) / canvas.width; 
      
      const pageHeightInsideMargin = A4_HEIGHT - (MARGIN * 2);

      const imgData = canvas.toDataURL('image/png');

      let heightLeft = imgHeight;
      let position = 0; // Vị trí (y) để cắt ảnh

      // 3. Vòng lặp cắt trang an toàn
      // Chúng ta sẽ dịch chuyển vị trí ảnh lên trên để in phần tiếp theo
      pdf.addImage(imgData, 'PNG', MARGIN, MARGIN, imgWidth, imgHeight);
      heightLeft -= pageHeightInsideMargin;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight; 
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', MARGIN, position + MARGIN, imgWidth, imgHeight);
        heightLeft -= pageHeightInsideMargin;
      }

      pdf.save('LSAT_VietHoa.pdf');
    } catch (err) {
      console.error("PDF Error:", err);
      setError('Lỗi khi xuất PDF: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      <header className="bg-white border-b border-slate-200 py-4 px-6 sm:px-10 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <div className="bg-blue-600 p-2.5 rounded-xl shadow-md shadow-blue-200">
          <FileText className="text-white w-6 h-6"/>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">LSAT Logic Viet<span className="text-blue-600">Pro</span></h1>
          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Công cụ Việt hóa 1-chạm</p>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 h-[calc(100vh-140px)] min-h-[600px]">
          
          {/* Nguồn Tiếng Anh */}
          <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                 <Languages className="w-4 h-4"/>
                 Nguồn Tiếng Anh (English)
              </h2>
            </div>
            <div className="flex-1 p-4">
               <textarea
                 className="w-full h-full p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all resize-none text-base leading-relaxed text-slate-700 bg-slate-50"
                 placeholder="Dán toàn bộ đề bài LSAT Logic Games hoặc Logical Reasoning vào đây..."
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 spellCheck="false"
               />
            </div>
            
            {error && (
               <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-start gap-2 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>
                  <p>{error}</p>
               </div>
            )}

            <div className="p-4 border-t border-slate-100 bg-slate-50">
               <button
                 onClick={handleTranslate}
                 disabled={isLoading}
                 className={`w-full py-4 px-6 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg
                   ${isLoading 
                     ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none' 
                     : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 hover:-translate-y-0.5 active:translate-y-0'
                   }`}
               >
                 {isLoading ? (
                   <>
                     <div className="w-5 h-5 border-3 border-slate-400 border-t-slate-600 rounded-full animate-spin"></div>
                     Đang xử lý dữ liệu...
                   </>
                 ) : (
                   <>
                     <Wand2 className="w-5 h-5"/>
                     Tiến hành Việt Hóa (1-Click)
                     <ArrowRight className="w-5 h-5 opacity-70"/>
                   </>
                 )}
               </button>
            </div>
          </div>

          {/* Bản dịch hoàn thiện */}
          <div className="flex flex-col h-full rounded-2xl overflow-hidden bg-slate-200/70 border border-slate-300 shadow-inner relative">
            <div className="px-4 py-3 border-b border-slate-300 bg-slate-200 flex justify-between items-center z-10">
               <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4"/>
                 Bản dịch hoàn thiện
               </h2>
               <button
                 onClick={handleExportPDF}
                 disabled={!isPdfReady || isLoading}
                 className={`py-2 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors
                   ${!isPdfReady || isLoading
                     ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                     : 'bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 shadow-sm border border-slate-300'
                   }`}
               >
                 <Download className="w-4 h-4"/>
                 Xuất file PDF
               </button>
            </div>

            {/* Giấy mô phỏng */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar flex justify-center">
               
               {!outputData && !isLoading ? (
                  <div className="w-full max-w-2xl bg-white/50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 p-8 text-center m-auto">
                    <FileText className="w-16 h-16 mb-4 text-slate-300"/>
                    <p className="font-medium text-slate-600 text-lg">Trang giấy đang trống</p>
                    <p className="text-sm mt-2 max-w-sm text-slate-500">Bản dịch sẽ được tự động dàn trang giống hệt form đề thi trắc nghiệm Việt Nam tại đây.</p>
                  </div>
               ) : isLoading ? (
                  <div className="w-full max-w-2xl bg-white rounded-xl shadow-md border border-slate-200 p-12 flex flex-col items-center justify-center space-y-6 m-auto">
                     <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin"></div>
                     </div>
                     <div className="text-center">
                        <p className="text-slate-800 font-bold text-lg mb-1">Đang phân tích và dịch thuật...</p>
                        <p className="text-slate-500 text-sm animate-pulse">Quá trình này có thể mất vài giây.</p>
                     </div>
                  </div>
               ) : (
                  <div 
                    ref={outputRef}
                    className="bg-white w-full max-w-[800px] shadow-xl border border-slate-200"
                    style={{
                       fontFamily: '"Times New Roman", Times, serif',
                       fontSize: '16px',
                       lineHeight: '1.4', // Giảm line-height xuống một chút cho giống đề thi thực tế
                       color: '#000',
                       padding: '40px 50px',
                       minHeight: '100%',
                       height: 'max-content' // QUAN TRỌNG: Để html2canvas đo đúng chiều cao thực
                    }}
                  >
                     <div className="flex flex-col gap-2">
                        
                        {outputData.instruction && (
                           <div className="font-bold text-[17px] mb-1">
                              {renderFormattedText(outputData.instruction)}
                           </div>
                        )}
                        
                        {outputData.context && (
                           <div className="text-left mb-2" style={{ textIndent: '30px' }}>
                              {renderFormattedText(outputData.context)}
                           </div>
                        )}
                        
                        {outputData.rules && outputData.rules.length > 0 && (
                           <div className="flex flex-col mb-4">
                              {outputData.rules.map((rule, idx) => (
                                 <div key={idx} className="flex gap-2 text-left pl-4">
                                    <span className="font-bold">-</span>
                                    <span>{renderFormattedText(rule)}</span>
                                 </div>
                              ))}
                           </div>
                        )}
                        
                        {/* Khu vực hiển thị câu hỏi và đáp án */}
                        {outputData.questions && outputData.questions.length > 0 && (
                           <div className="flex flex-col gap-5 mt-2">
                              {outputData.questions.map((q, idx) => {
                                 const options = q.options || {};
                                 const availableOptionsKeys = ['A', 'B', 'C', 'D', 'E'].filter(opt => options[opt] && options[opt].trim() !== '');

                                 // Xác định độ dài chữ lớn nhất để chia cột
                                 let maxLength = 0;
                                 availableOptionsKeys.forEach(key => {
                                    if(options[key].length > maxLength) maxLength = options[key].length;
                                 });

                                 // Logic chia cột MỚI - Flexbox kết hợp Width %
                                 // Thay vì dùng Grid cứng nhắc, ta dùng Flex Wrap để chữ không bị kéo dãn
                                 let itemWidth = 'w-full'; // Mặc định 1 cột (đáp án dài)
                                 if (maxLength < 25 && availableOptionsKeys.length >= 4) {
                                    itemWidth = 'w-[23%]'; // 4 cột (khoảng 23% mỗi cột + gap)
                                 } else if (maxLength < 65 && availableOptionsKeys.length >= 2) {
                                    itemWidth = 'w-[48%]'; // 2 cột (khoảng 48% mỗi cột + gap)
                                 }

                                 return (
                                    <div key={idx} className="text-left">
                                       <div className="mb-2">
                                          <span className="font-bold">Câu {q.number || idx + 1}: </span>
                                          <span>{renderFormattedText(q.text)}</span>
                                       </div>
                                       
                                       {availableOptionsKeys.length > 0 && (
                                          <div className="flex flex-wrap gap-y-2 gap-x-2 pl-4">
                                             {availableOptionsKeys.map(opt => (
                                                <div key={opt} className={`flex items-start gap-1 ${itemWidth}`}>
                                                   <span className="font-bold shrink-0">{opt}.</span>
                                                   <span>{renderFormattedText(options[opt])}</span>
                                                </div>
                                             ))}
                                          </div>
                                       )}
                                    </div>
                                 );
                              })}
                           </div>
                        )}
                     </div>
                  </div>
               )}
            </div>
          </div>

        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.02); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
      `}} />
    </div>
  );
}